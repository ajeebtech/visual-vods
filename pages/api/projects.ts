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
    const authResult = getAuth(req)
    const userId = authResult?.userId
    
    // Get the authorization token from the request
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized - no token provided' })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // If getAuth didn't work, try to decode JWT
    let finalUserId = userId
    if (!finalUserId) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
        finalUserId = payload.sub
      } catch (decodeError) {
        console.error('Failed to decode JWT:', decodeError)
        return res.status(401).json({ 
          error: 'Unauthorized - invalid token format' 
        })
      }
    }
    
    if (!finalUserId) {
      return res.status(401).json({ 
        error: 'Unauthorized - could not get user ID from request' 
      })
    }

    // Create a Supabase client with the Clerk JWT token for RLS
    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    )

    // GET - Get all projects for user or a specific project
    if (req.method === 'GET') {
      const { id } = req.query
      const { getCached, getCacheKey } = await import('../../lib/redis')

      if (id) {
        // Get a specific project with its sessions
        const cacheKey = getCacheKey('project', id as string)
        
        const project = await getCached(
          cacheKey,
          async () => {
            const { data: projectData, error: projectError } = await userSupabase
              .from('projects')
              .select('*')
              .eq('id', id as string)
              .single()

            if (projectError || !projectData) {
              return null
            }

            // Get sessions for this project
            const { data: projectSessions, error: sessionsError } = await userSupabase
              .from('projects_sessions')
              .select('session_id')
              .eq('project_id', id as string)

            if (sessionsError) {
              console.error('Error fetching project sessions:', sessionsError)
            }

            const sessionIds = (projectSessions || []).map((ps: any) => ps.session_id)

            return {
              ...projectData,
              session_ids: sessionIds
            }
          },
          60 // 1 minute TTL
        )

        if (!project) {
          return res.status(404).json({ error: 'Project not found' })
        }

        return res.status(200).json(project)
      } else {
        // Get all projects for the user
        const cacheKey = getCacheKey('projects', finalUserId)
        
        const result = await getCached(
          cacheKey,
          async () => {
            const { data: projects, error } = await userSupabase
              .from('projects')
              .select('*')
              .eq('user_id', finalUserId)
              .order('created_at', { ascending: false })

            if (error) {
              throw error
            }

            return { projects: projects || [] }
          },
          60 // 1 minute TTL
        )

        return res.status(200).json(result)
      }
    }

    // POST - Create a new project
    if (req.method === 'POST') {
      const { name, description, session_ids } = req.body

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required' })
      }

      // Create the project
      const { data: project, error: projectError } = await userSupabase
        .from('projects')
        .insert({
          user_id: finalUserId,
          name: name.trim(),
          description: description || null
        })
        .select()
        .single()

      if (projectError) {
        console.error('Error creating project:', projectError)
        return res.status(500).json({ error: projectError.message })
      }

      // Invalidate cache after creating project
      try {
        const { invalidateCache, getCacheKey } = await import('../../lib/redis')
        await invalidateCache(getCacheKey('projects', finalUserId))
      } catch (cacheError) {
        console.error('Error invalidating cache:', cacheError)
      }

      // Add sessions to the project if provided
      if (session_ids && Array.isArray(session_ids) && session_ids.length > 0) {
        const projectSessions = session_ids.map((sessionId: string) => ({
          project_id: project.id,
          session_id: sessionId
        }))

        const { error: sessionsError } = await userSupabase
          .from('projects_sessions')
          .insert(projectSessions)

        if (sessionsError) {
          console.error('Error adding sessions to project:', sessionsError)
          // Continue even if adding sessions fails - project is still created
        }
      }

      return res.status(201).json(project)
    }

    // PUT - Update a project (name, description, or sessions)
    if (req.method === 'PUT') {
      const { id, name, description, session_ids } = req.body

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      const updateData: any = {}
      if (name !== undefined) updateData.name = name.trim()
      if (description !== undefined) updateData.description = description

      // Update project if there are changes
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await userSupabase
          .from('projects')
          .update(updateData)
          .eq('id', id)
          .eq('user_id', finalUserId) // Ensure user owns the project

        if (updateError) {
          console.error('Error updating project:', updateError)
          return res.status(500).json({ error: updateError.message })
        }
      }

      // Update sessions if provided
      if (session_ids !== undefined && Array.isArray(session_ids)) {
        // Delete existing sessions
        const { error: deleteError } = await userSupabase
          .from('projects_sessions')
          .delete()
          .eq('project_id', id)

        if (deleteError) {
          console.error('Error deleting project sessions:', deleteError)
        }

        // Add new sessions
        if (session_ids.length > 0) {
          const projectSessions = session_ids.map((sessionId: string) => ({
            project_id: id,
            session_id: sessionId
          }))

          const { error: insertError } = await userSupabase
            .from('projects_sessions')
            .insert(projectSessions)

          if (insertError) {
            console.error('Error adding sessions to project:', insertError)
          }
        }
      }

      // Fetch updated project
      const { data: updatedProject, error: fetchError } = await userSupabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) {
        return res.status(500).json({ error: fetchError.message })
      }

      // Invalidate cache after updating project
      try {
        const { invalidateCache, getCacheKey } = await import('../../lib/redis')
        await invalidateCache(getCacheKey('projects', finalUserId))
        await invalidateCache(getCacheKey('project', id))
      } catch (cacheError) {
        console.error('Error invalidating cache:', cacheError)
      }

      return res.status(200).json(updatedProject)
    }

    // DELETE - Delete a project
    if (req.method === 'DELETE') {
      const { id } = req.query

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      // Delete project (cascade will delete projects_sessions)
      const { error } = await userSupabase
        .from('projects')
        .delete()
        .eq('id', id as string)
        .eq('user_id', finalUserId) // Ensure user owns the project

      if (error) {
        console.error('Error deleting project:', error)
        return res.status(500).json({ error: error.message })
      }

      // Invalidate cache after deleting project
      try {
        const { invalidateCache, getCacheKey } = await import('../../lib/redis')
        await invalidateCache(getCacheKey('projects', finalUserId))
        await invalidateCache(getCacheKey('project', id as string))
      } catch (cacheError) {
        console.error('Error invalidating cache:', cacheError)
      }

      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Error in projects API:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

