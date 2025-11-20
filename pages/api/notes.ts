import { NextApiRequest, NextApiResponse } from 'next'
import { getAuth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    // Get Clerk user from request
    const { userId } = getAuth(req)
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // Get the authorization token from the request
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const token = authHeader.replace('Bearer ', '')

    // Create a Supabase client with the Clerk JWT token for RLS
    // This ensures auth.jwt()->>'sub' works correctly in RLS policies
    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    )

    if (req.method === 'POST') {
      // Create a new note
      const { session_id, match_href, vod_url, timestamp_seconds, note_text } = req.body

      if (!session_id || !match_href || !vod_url || timestamp_seconds === undefined || !note_text) {
        return res.status(400).json({ error: 'All fields are required' })
      }

      // Verify session belongs to user (RLS will handle this, but we check for better error messages)
      const { data: session, error: sessionError } = await userSupabase
        .from('sessions')
        .select('id')
        .eq('id', session_id)
        .single()

      if (sessionError || !session) {
        return res.status(404).json({ error: 'Session not found' })
      }

      // Use the user-specific client so RLS policies can check auth.uid()
      const { data, error } = await userSupabase
        .from('notes')
        .insert({
          session_id,
          user_id: userId,
          match_href,
          vod_url,
          timestamp_seconds,
          note_text
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating note:', error)
        return res.status(500).json({ error: error.message })
      }

      return res.status(201).json(data)
    }

    if (req.method === 'GET') {
      // Get notes for a session and match
      const { session_id, match_href, vod_url } = req.query

      if (!session_id) {
        return res.status(400).json({ error: 'session_id is required' })
      }

      // Verify session belongs to user (RLS will handle this)
      const { data: session, error: sessionError } = await userSupabase
        .from('sessions')
        .select('id')
        .eq('id', session_id as string)
        .single()

      if (sessionError || !session) {
        return res.status(404).json({ error: 'Session not found' })
      }

      let query = userSupabase
        .from('notes')
        .select('*')
        .eq('session_id', session_id as string)
        .order('timestamp_seconds', { ascending: true })

      if (match_href) {
        query = query.eq('match_href', match_href as string)
      }

      if (vod_url) {
        query = query.eq('vod_url', vod_url as string)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching notes:', error)
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json(data || [])
    }

    if (req.method === 'PUT') {
      // Update a note
      const { id, timestamp_seconds, note_text } = req.body

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      const updateData: any = {}
      if (timestamp_seconds !== undefined) updateData.timestamp_seconds = timestamp_seconds
      if (note_text !== undefined) updateData.note_text = note_text

      const { data, error } = await userSupabase
        .from('notes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating note:', error)
        return res.status(500).json({ error: error.message })
      }

      if (!data) {
        return res.status(404).json({ error: 'Note not found' })
      }

      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      // Delete a note
      const { id } = req.query

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      const { error } = await userSupabase
        .from('notes')
        .delete()
        .eq('id', id as string)

      if (error) {
        console.error('Error deleting note:', error)
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Error in notes API:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

