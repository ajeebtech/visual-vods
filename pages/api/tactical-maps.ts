import { NextApiRequest, NextApiResponse } from 'next'
import { getAuth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import type { TacticalMap, TacticalMapCreate, TacticalMapState } from '@/types/tactical-map-types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { userId } = getAuth(req)

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    // Initialize Supabase client with service role for RLS bypass
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    try {
        if (req.method === 'GET') {
            // Get all tactical maps for a session
            const { session_id, match_href, vod_url } = req.query

            if (!session_id) {
                return res.status(400).json({ error: 'session_id is required' })
            }

            let query = supabase
                .from('tactical_maps')
                .select('*')
                .eq('session_id', session_id)
                .order('updated_at', { ascending: false })

            // Optional filters
            if (match_href) {
                query = query.eq('match_href', match_href)
            }
            if (vod_url) {
                query = query.eq('vod_url', vod_url)
            }

            const { data, error } = await query

            if (error) {
                console.error('Error fetching tactical maps:', error)
                return res.status(500).json({ error: 'Failed to fetch tactical maps' })
            }

            return res.status(200).json(data || [])
        }

        if (req.method === 'POST') {
            // Create or update a tactical map
            const { id, session_id, match_href, vod_url, map_name, title, map_state } = req.body as Partial<TacticalMap>

            if (!session_id || !match_href || !vod_url || !map_state) {
                return res.status(400).json({
                    error: 'session_id, match_href, vod_url, and map_state are required'
                })
            }

            // Validate map_state structure
            if (!map_state.placedAgents || !map_state.drawingPaths || !map_state.selectedMap) {
                return res.status(400).json({
                    error: 'Invalid map_state structure'
                })
            }

            if (id) {
                // Update existing map
                const { data, error } = await supabase
                    .from('tactical_maps')
                    .update({
                        title: title || 'Untitled Strategy',
                        map_name: map_name || map_state.selectedMap,
                        map_state,
                        last_modified_by: userId,
                    })
                    .eq('id', id)
                    .select()
                    .single()

                if (error) {
                    console.error('Error updating tactical map:', error)
                    return res.status(500).json({ error: 'Failed to update tactical map' })
                }

                return res.status(200).json(data)
            } else {
                // Create new map
                const { data, error } = await supabase
                    .from('tactical_maps')
                    .insert({
                        session_id,
                        match_href,
                        vod_url,
                        map_name: map_name || map_state.selectedMap,
                        title: title || 'Untitled Strategy',
                        map_state,
                        created_by: userId,
                        last_modified_by: userId,
                    })
                    .select()
                    .single()

                if (error) {
                    console.error('Error creating tactical map:', error)
                    return res.status(500).json({ error: 'Failed to create tactical map' })
                }

                return res.status(201).json(data)
            }
        }

        if (req.method === 'DELETE') {
            // Delete a tactical map
            const { id } = req.query

            if (!id || typeof id !== 'string') {
                return res.status(400).json({ error: 'id is required' })
            }

            // Check if user owns the map
            const { data: existingMap, error: fetchError } = await supabase
                .from('tactical_maps')
                .select('created_by')
                .eq('id', id)
                .single()

            if (fetchError || !existingMap) {
                return res.status(404).json({ error: 'Tactical map not found' })
            }

            if (existingMap.created_by !== userId) {
                return res.status(403).json({ error: 'You can only delete your own tactical maps' })
            }

            const { error } = await supabase
                .from('tactical_maps')
                .delete()
                .eq('id', id)

            if (error) {
                console.error('Error deleting tactical map:', error)
                return res.status(500).json({ error: 'Failed to delete tactical map' })
            }

            return res.status(200).json({ success: true })
        }

        return res.status(405).json({ error: 'Method not allowed' })
    } catch (error) {
        console.error('Tactical maps API error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
