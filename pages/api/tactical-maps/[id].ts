import { NextApiRequest, NextApiResponse } from 'next'
import { getAuth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import type { TacticalMap, TacticalMapUpdate } from '@/types/tactical-map-types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { userId } = getAuth(req)

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    const { id } = req.query

    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid map ID' })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    try {
        if (req.method === 'GET') {
            // Get specific tactical map by ID
            const { data, error } = await supabase
                .from('tactical_maps')
                .select('*')
                .eq('id', id)
                .single()

            if (error || !data) {
                return res.status(404).json({ error: 'Tactical map not found' })
            }

            return res.status(200).json(data)
        }

        if (req.method === 'PUT') {
            // Update specific tactical map
            const updates: TacticalMapUpdate = req.body

            if (!updates.title && !updates.map_state && !updates.map_name) {
                return res.status(400).json({ error: 'No updates provided' })
            }

            const updateData: any = {
                last_modified_by: userId,
            }

            if (updates.title) updateData.title = updates.title
            if (updates.map_name) updateData.map_name = updates.map_name
            if (updates.map_state) {
                // Validate map_state structure
                if (!updates.map_state.placedAgents || !updates.map_state.drawingPaths || !updates.map_state.selectedMap) {
                    return res.status(400).json({ error: 'Invalid map_state structure' })
                }
                updateData.map_state = updates.map_state
            }

            const { data, error } = await supabase
                .from('tactical_maps')
                .update(updateData)
                .eq('id', id)
                .select()
                .single()

            if (error) {
                console.error('Error updating tactical map:', error)
                return res.status(500).json({ error: 'Failed to update tactical map' })
            }

            return res.status(200).json(data)
        }

        if (req.method === 'DELETE') {
            // Delete specific tactical map
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
        console.error('Tactical map [id] API error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
