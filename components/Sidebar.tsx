import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tooltip } from "@heroui/react"
import {
    Clock,
    Settings,
    Search,
    AlignLeft,
    ChevronDown,
    Library,
    Disc, // Using Disc as a placeholder for the spiral icon if needed, or custom SVG
    User,
    Edit2,
    Check,
    X,
    UserPlus,
    UserCheck,
    UserX,
    Users,
    Plus
} from 'lucide-react'
import { SettingsModal } from './SettingsModal'
import AuthButton from './AuthButton'
import MessagesPanel from './MessagesPanel'
import CreateProjectModal from './CreateProjectModal'
import EditProjectModal from './EditProjectModal'
import { useSupabase } from '@/lib/supabase-client'
import { useUser, useSession } from '@clerk/nextjs'
import { getCached, setCached, getCacheKey, invalidateCache, fetchCached } from '@/lib/local-cache'

// Custom Spiral Icon since Lucide might not have an exact match
const SpiralIcon = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M12 20.5c4.7 0 8.5-3.8 8.5-8.5 0-4.7-3.8-8.5-8.5-8.5-4.7 0-8.5 3.8-8.5 8.5 0 2.3.9 4.4 2.5 6" />
        <path d="M12 16.5c2.5 0 4.5-2 4.5-4.5 0-2.5-2-4.5-4.5-4.5-2.5 0-4.5 2-4.5 4.5 0 1.2.5 2.3 1.3 3.2" />
        <path d="M12 12.5c.3 0 .5-.2.5-.5 0-.3-.2-.5-.5-.5-.3 0-.5.2-.5.5 0 .3.2.5.5.5z" />
    </svg>
)

// Messaging Icon
const MessagingIcon = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        color="currentColor"
        fill="none"
        className={className}
    >
        <path d="M8.5 14.5H15.5M8.5 9.5H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
        <path d="M14.1706 20.8905C18.3536 20.6125 21.6856 17.2332 21.9598 12.9909C22.0134 12.1607 22.0134 11.3009 21.9598 10.4707C21.6856 6.22838 18.3536 2.84913 14.1706 2.57107C12.7435 2.47621 11.2536 2.47641 9.8294 2.57107C5.64639 2.84913 2.31441 6.22838 2.04024 10.4707C1.98659 11.3009 1.98659 12.1607 2.04024 12.9909C2.1401 14.536 2.82343 15.9666 3.62791 17.1746C4.09501 18.0203 3.78674 19.0758 3.30021 19.9978C2.94941 20.6626 2.77401 20.995 2.91484 21.2351C3.05568 21.4752 3.37026 21.4829 3.99943 21.4982C5.24367 21.5285 6.08268 21.1757 6.74868 20.6846C7.1264 20.4061 7.31527 20.2668 7.44544 20.2508C7.5756 20.2348 7.83177 20.3403 8.34401 20.5513C8.8044 20.7409 9.33896 20.8579 9.8294 20.8905C11.2536 20.9852 12.7435 20.9854 14.1706 20.8905Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"></path>
    </svg>
)

// Curate Session Icon
const CurateSessionIcon = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M224,88V200.89a7.11,7.11,0,0,1-7.11,7.11H40a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H93.33a8,8,0,0,1,4.8,1.6L128,80h88A8,8,0,0,1,224,88Z" />
        <line x1="104" y1="144" x2="152" y2="144" />
        <line x1="128" y1="120" x2="128" y2="168" />
    </svg>
)

interface Session {
    id: string
    title: string
    team1_name: string | null
    team2_name: string | null
    tournament: string | null
    player_name: string | null
    matches_data: any
    created_at: string
}

interface SidebarProps {
    onLoadSession?: (session: Session) => void
}

export default function Sidebar({ onLoadSession }: SidebarProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [username, setUsername] = useState<string>('User Name')
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [avatarKey, setAvatarKey] = useState<number>(0) // Force re-render when avatar changes
    const [sessions, setSessions] = useState<Session[]>([])
    const [isLoadingSessions, setIsLoadingSessions] = useState(false)
    const [hasMoreSessions, setHasMoreSessions] = useState(false)
    const [sessionsOffset, setSessionsOffset] = useState(0)
    const sessionsListRef = useRef<HTMLDivElement>(null)
    const [showHistory, setShowHistory] = useState(false)
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState<string>('')
    const sidebarRef = useRef<HTMLDivElement>(null)

    // Friend requests state
    const [showFriends, setShowFriends] = useState(false)
    const [friendSearchQuery, setFriendSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<Array<{ id: string, username: string, avatar_url: string | null }>>([])
    const [isSearching, setIsSearching] = useState(false)
    const [friendRequests, setFriendRequests] = useState<Array<{
        id: string
        status: string
        isRequester: boolean
        friend: { id: string, username: string, avatar_url: string | null }
    }>>([])
    const [isLoadingRequests, setIsLoadingRequests] = useState(false)
    const [friendsList, setFriendsList] = useState<Array<{
        id: string
        friend: { id: string, username: string, avatar_url: string | null }
    }>>([])
    const [isLoadingFriends, setIsLoadingFriends] = useState(false)
    const [hasMoreFriends, setHasMoreFriends] = useState(false)
    const [friendsOffset, setFriendsOffset] = useState(0)
    const friendsListRef = useRef<HTMLDivElement>(null)
    const [showMessages, setShowMessages] = useState(false)
    const [showCreateProject, setShowCreateProject] = useState(false)
    const [projects, setProjects] = useState<Array<{ id: string, name: string, description: string | null, created_at: string }>>([])
    const [isLoadingProjects, setIsLoadingProjects] = useState(false)
    const [showProjects, setShowProjects] = useState(false)
    const [selectedProject, setSelectedProject] = useState<{ id: string, name: string, description: string | null, created_at: string, session_ids?: string[] } | null>(null)
    const [showEditProject, setShowEditProject] = useState(false)

    // Debug: Log when avatarUrl changes
    useEffect(() => {
        console.log('🔄 avatarUrl state changed:', avatarUrl)
        console.log('🎨 Rendering profile button - avatarUrl:', avatarUrl, 'type:', typeof avatarUrl, 'isTruthy:', !!avatarUrl)
    }, [avatarUrl])

    const { supabase } = useSupabase()
    const { user: clerkUser } = useUser()
    const { session: clerkSession } = useSession()

    // Fetch user profile data
    const fetchUserProfile = async () => {
        if (!clerkUser) return

        try {
            console.log('📥 Fetching user profile...')
            console.log('Clerk user:', { id: clerkUser.id, email: clerkUser.emailAddresses[0]?.emailAddress })

            // First, try to fetch from profiles table via API route (ensures JWT is sent correctly)
            let savedUsername: string | null = null
            let savedAvatar: string | null = null

            if (clerkSession) {
                try {
                    const token = await clerkSession.getToken({ template: 'supabase' })
                    if (token) {
                        const cacheKey = getCacheKey('profile', clerkUser.id)
                        
                        // Try cache first
                        const cached = getCached<{ data: { username: string | null, avatar_url: string | null } }>(cacheKey)
                        if (cached && cached.data) {
                            savedUsername = cached.data.username || null
                            savedAvatar = cached.data.avatar_url || null
                            console.log('✅ Profile fetched from cache:', { savedUsername, savedAvatar })
                        } else {
                        const response = await fetch('/api/profile', {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        })

                        if (response.ok) {
                            const result = await response.json()
                                // Cache the result
                                setCached(cacheKey, result, 300) // 5 minutes
                                
                            if (result.data) {
                                savedUsername = result.data.username || null
                                savedAvatar = result.data.avatar_url || null
                                console.log('✅ Profile fetched from API:', { savedUsername, savedAvatar })
                            } else {
                                // Profile doesn't exist - create it automatically
                                console.log('📝 Creating new profile for user:', clerkUser.id)
                                const createResponse = await fetch('/api/profile', {
                                    method: 'PUT',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                        username: clerkUser.fullName || clerkUser.firstName || null,
                                        avatar_url: clerkUser.imageUrl || null
                                    })
                                })

                                if (createResponse.ok) {
                                    console.log('✅ Profile created successfully')
                                        // Invalidate cache
                                        invalidateCache(getCacheKey('profile', clerkUser.id))
                                    // Fetch the newly created profile
                                    const fetchResponse = await fetch('/api/profile', {
                                        method: 'GET',
                                        headers: {
                                            'Authorization': `Bearer ${token}`
                                        }
                                    })
                                    if (fetchResponse.ok) {
                                        const fetchResult = await fetchResponse.json()
                                            // Cache the result
                                            setCached(getCacheKey('profile', clerkUser.id), fetchResult, 300)
                                        if (fetchResult.data) {
                                            savedUsername = fetchResult.data.username || null
                                            savedAvatar = fetchResult.data.avatar_url || null
                                        }
                                    }
                                } else {
                                    const createError = await createResponse.json()
                                    console.warn('Could not create profile:', createError)
                                }
                            }
                        } else {
                            const error = await response.json()
                            console.warn('Could not fetch profile:', error)
                            }
                        }
                    }
                } catch (err: any) {
                    console.warn('Error fetching profile from API:', err)
                }
            }

            // Priority order for username:
            // 1. Saved username from profiles table
            // 2. Clerk user's full name
            // 3. Clerk user's first name
            // 4. Email username (fallback)
            const displayName = savedUsername ||
                clerkUser.fullName ||
                clerkUser.firstName ||
                clerkUser.emailAddresses[0]?.emailAddress?.split('@')[0] ||
                'User Name'

            // Priority order for avatar:
            // 1. Saved avatar from profiles table
            // 2. Clerk user's image URL
            let avatar = savedAvatar ||
                clerkUser.imageUrl ||
                null

            // If avatar is a storage path (not a full URL), convert it to a public URL
            if (avatar && !avatar.startsWith('http') && supabase) {
                // It's a storage path, get the public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(avatar)
                avatar = publicUrl
            }

            console.log('📸 Setting avatar URL:', avatar)
            console.log('📸 Saved avatar from DB:', savedAvatar)
            console.log('📸 Clerk image URL:', clerkUser.imageUrl)

            setUsername(displayName)
            setAvatarUrl(avatar)
            // Update avatar key to force image refresh
            if (avatar !== avatarUrl) {
                setAvatarKey(prev => prev + 1)
            }
            console.log('Profile loaded:', {
                displayName,
                avatar,
                hasAvatar: !!avatar,
                clerkUserId: clerkUser.id,
                avatarUrlState: avatar
            })
        } catch (error) {
            console.error('Error fetching user profile:', error)
            // Fallback to Clerk data if API fails
            if (clerkUser) {
                setUsername(clerkUser.fullName || clerkUser.firstName || 'User Name')
                setAvatarUrl(clerkUser.imageUrl || null)
            }
        }
    }

    useEffect(() => {
        if (clerkUser && clerkSession) {
            fetchUserProfile()
        } else {
            setUsername('User Name')
            setAvatarUrl(null)
        }
    }, [clerkUser, clerkSession])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
                setIsExpanded(false)
            }
        }

        if (isExpanded) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isExpanded])

    const handleSettingsUpdate = async () => {
        console.log('🔄 Settings update triggered - refreshing profile...')
        // Invalidate profile cache
        if (clerkUser) {
            invalidateCache(getCacheKey('profile', clerkUser.id))
        }
        // Wait a moment for the database to sync
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Force refresh by calling fetchUserProfile
        // Make sure we have the session before fetching
        if (clerkUser && clerkSession) {
            await fetchUserProfile()
            console.log('✅ Profile refresh complete')
        } else {
            console.warn('⚠️ Cannot refresh profile - missing clerkUser or clerkSession')
            // Try again after a short delay
            setTimeout(async () => {
                if (clerkUser && clerkSession) {
                    await fetchUserProfile()
                }
            }, 500)
        }
    }

    // Fetch projects
    const fetchProjects = async () => {
        if (!clerkUser || !clerkSession) {
            setIsLoadingProjects(false)
            return
        }

        setIsLoadingProjects(true)
        try {
            const token = await clerkSession.getToken({ template: 'supabase' })

            if (!token) {
                console.warn('Could not get token for fetching projects')
                setIsLoadingProjects(false)
                return
            }

            const cacheKey = getCacheKey('projects', clerkUser.id)
            
            // Try cache first
            const cached = getCached<{ projects: Array<{ id: string, name: string, description: string | null, created_at: string }> }>(cacheKey)
            if (cached) {
                setProjects(cached.projects || [])
                setIsLoadingProjects(false)
                return
            }

            const response = await fetch('/api/projects', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.ok) {
                const data = await response.json()
                // Cache the result
                setCached(cacheKey, data, 120) // 2 minutes
                setProjects(data.projects || [])
            } else {
                console.error('Error fetching projects:', response.statusText)
            }
        } catch (error) {
            console.error('Error fetching projects:', error)
        } finally {
            setIsLoadingProjects(false)
        }
    }

    // Fetch saved sessions with pagination
    const fetchSessions = async (reset = false) => {
        if (!clerkUser || !clerkSession) {
            setIsLoadingSessions(false)
            return
        }

        setIsLoadingSessions(true)
        try {
            const token = await clerkSession.getToken({ template: 'supabase' })

            if (!token) {
                console.warn('Could not get token for fetching sessions')
                setIsLoadingSessions(false)
                return
            }

            const offset = reset ? 0 : sessionsOffset
            const limit = 5
            const cacheKey = getCacheKey('sessions', clerkUser.id, limit, offset)
            
            // Try cache first (only for first page)
            if (reset) {
                const cached = getCached<{ sessions: Session[], hasMore: boolean, total: number }>(cacheKey)
                if (cached) {
                    console.log('📥 Sessions fetched from cache:', cached.sessions.length, 'sessions')
                    setSessions(cached.sessions || [])
                    setHasMoreSessions(cached.hasMore || false)
                    setSessionsOffset(limit)
                    setIsLoadingSessions(false)
                    return
                }
            }

            console.log('📥 Fetching sessions from API...', { limit, offset })
            const response = await fetch(`/api/sessions?limit=${limit}&offset=${offset}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            console.log('📥 Sessions API response:', { status: response.status, ok: response.ok })

            if (response.ok) {
                const data = await response.json()
                // Cache the result (only for first page)
                if (reset) {
                    setCached(cacheKey, data, 60) // 1 minute
                }
                
                if (reset) {
                    setSessions(data.sessions || [])
                    setSessionsOffset(limit)
                } else {
                    setSessions(prev => [...prev, ...(data.sessions || [])])
                    setSessionsOffset(prev => prev + limit)
                }
                setHasMoreSessions(data.hasMore || false)
                console.log('📥 Sessions fetched:', data?.sessions?.length || 0, 'sessions, hasMore:', data.hasMore)
            } else {
                const error = await response.json()
                console.error('❌ Error fetching sessions:', error)
            }
        } catch (error) {
            console.error('Error fetching sessions:', error)
        } finally {
            setIsLoadingSessions(false)
        }
    }

    // Load sessions when sidebar expands and history is shown
    useEffect(() => {
        if (isExpanded && showHistory && clerkUser && clerkSession) {
            console.log('🔄 Fetching sessions (sidebar expanded, history shown)')
            fetchSessions(true) // Reset to first page
        }
    }, [isExpanded, showHistory, clerkUser, clerkSession])

    // Infinite scroll for sessions list
    useEffect(() => {
        const sessionsListElement = sessionsListRef.current
        if (!sessionsListElement || !hasMoreSessions || isLoadingSessions || !clerkSession) return

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = sessionsListElement
            // Load more when user scrolls to within 50px of bottom
            if (scrollHeight - scrollTop - clientHeight < 50) {
                fetchSessions(false)
            }
        }

        sessionsListElement.addEventListener('scroll', handleScroll)
        return () => sessionsListElement.removeEventListener('scroll', handleScroll)
    }, [hasMoreSessions, isLoadingSessions, clerkSession, sessionsOffset])

    // Load projects when sidebar expands and projects section is shown
    useEffect(() => {
        if (isExpanded && showProjects && clerkUser && clerkSession) {
            fetchProjects()
        }
    }, [isExpanded, showProjects, clerkUser, clerkSession])

    const handleLoadSession = async (session: Session) => {
        // Don't load if we're editing
        if (editingSessionId === session.id) return

        // Update session's updated_at timestamp to move it to recently visited
        if (session.id && clerkSession) {
            try {
                const token = await clerkSession.getToken({ template: 'supabase' })
                if (token) {
                    // Invalidate cache
                    if (clerkUser) {
                        invalidateCache(getCacheKey('sessions', clerkUser.id))
                    }
                    // Update the session to refresh its updated_at timestamp
                    // The database trigger will automatically update updated_at
                    await fetch('/api/sessions', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            id: session.id,
                            // Just update the matches_data to trigger the update
                            matches_data: session.matches_data
                        })
                    })
                    // Invalidate cache and refresh sessions list to show updated order
                    if (clerkUser) {
                        // Invalidate all session cache entries for this user
                        invalidateCache(getCacheKey('sessions', clerkUser.id) + '*')
                    }
                    await fetchSessions(true) // Reset to first page
                }
            } catch (error) {
                console.error('Error updating session timestamp:', error)
                // Continue anyway - not critical
            }
        }

        if (onLoadSession) {
            onLoadSession(session)
            setIsExpanded(false)
            setShowHistory(false)
        }
    }

    const handleStartEdit = (session: Session, e: React.MouseEvent) => {
        e.stopPropagation()
        setEditingSessionId(session.id)
        setEditingTitle(session.title || 'Untitled Session')
    }

    const handleCancelEdit = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation()
        setEditingSessionId(null)
        setEditingTitle('')
    }

    // Friend requests functions
    const searchUsers = async (query: string) => {
        if (!query.trim() || query.length < 2) {
            setSearchResults([])
            return
        }

        if (!clerkSession || !clerkUser) return

        setIsSearching(true)
        try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            if (!token) {
                console.warn('No token available for search')
                return
            }

            const cacheKey = getCacheKey('friends:search', clerkUser.id, query.toLowerCase())
            
            // Try cache first
            const cached = getCached<{ users: Array<{ id: string, username: string, avatar_url: string | null }> }>(cacheKey)
            if (cached) {
                console.log('🔍 Search results from cache:', cached.users?.length || 0, 'users')
                setSearchResults(cached.users || [])
                setIsSearching(false)
                return
            }

            console.log('🔍 Searching for:', query)
            const response = await fetch(`/api/friends?action=search&query=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            console.log('🔍 Search response status:', response.status)

            if (response.ok) {
                const data = await response.json()
                // Cache the result
                setCached(cacheKey, data, 300) // 5 minutes
                console.log('🔍 Search results:', data.users?.length || 0, 'users')
                setSearchResults(data.users || [])
            } else {
                const error = await response.json()
                console.error('🔍 Search error:', error)
            }
        } catch (error) {
            console.error('Error searching users:', error)
        } finally {
            setIsSearching(false)
        }
    }

    const fetchFriendRequests = async () => {
        if (!clerkSession || !clerkUser) return

        setIsLoadingRequests(true)
        try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            if (!token) return

            const cacheKey = getCacheKey('friends:requests', clerkUser.id, 'pending')
            
            // Try cache first
            const cached = getCached<{ requests: Array<{
                id: string
                status: string
                isRequester: boolean
                friend: { id: string, username: string, avatar_url: string | null }
            }> }>(cacheKey)
            if (cached) {
                setFriendRequests(cached.requests || [])
                setIsLoadingRequests(false)
                return
            }

            const response = await fetch('/api/friends?action=requests&status=pending', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.ok) {
                const data = await response.json()
                // Cache the result
                setCached(cacheKey, data, 120) // 2 minutes
                setFriendRequests(data.requests || [])
            }
        } catch (error) {
            console.error('Error fetching friend requests:', error)
        } finally {
            setIsLoadingRequests(false)
        }
    }

    const sendFriendRequest = async (userId: string) => {
        if (!clerkSession) return

        try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            if (!token) return

            const response = await fetch('/api/friends?action=send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ addressee_id: userId })
            })

            if (response.ok) {
                // Invalidate cache
                if (clerkUser) {
                    invalidateCache(getCacheKey('friends:requests', clerkUser.id, '*'))
                    invalidateCache(getCacheKey('friends:list', clerkUser.id, '*'))
                }
                await fetchFriendRequests()
                setFriendSearchQuery('')
                setSearchResults([])
            } else {
                const error = await response.json()
                alert(error.error || 'Failed to send friend request')
            }
        } catch (error) {
            console.error('Error sending friend request:', error)
            alert('Failed to send friend request')
        }
    }

    const fetchFriendsList = async (reset = false) => {
        if (!clerkSession || !clerkUser) return

        setIsLoadingFriends(true)
        try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            if (!token) return

            const offset = reset ? 0 : friendsOffset
            const cacheKey = getCacheKey('friends:list', clerkUser.id, 20, offset)
            
            // Try cache first (only for first page)
            if (reset) {
                const cached = getCached<{ friends: Array<{
                    id: string
                    friend: { id: string, username: string, avatar_url: string | null }
                }>, hasMore: boolean }>(cacheKey)
                if (cached) {
                    setFriendsList(cached.friends || [])
                    setFriendsOffset(20)
                    setHasMoreFriends(cached.hasMore || false)
                    setIsLoadingFriends(false)
                    return
                }
            }

            const response = await fetch(`/api/friends?action=list&limit=20&offset=${offset}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.ok) {
                const data = await response.json()
                // Cache the result (only for first page)
                if (reset) {
                    setCached(cacheKey, data, 120) // 2 minutes
                }
                if (reset) {
                    setFriendsList(data.friends || [])
                    setFriendsOffset(20)
                } else {
                    setFriendsList(prev => [...prev, ...(data.friends || [])])
                    setFriendsOffset(prev => prev + 20)
                }
                setHasMoreFriends(data.hasMore || false)
            }
        } catch (error) {
            console.error('Error fetching friends list:', error)
        } finally {
            setIsLoadingFriends(false)
        }
    }

    // Infinite scroll for friends list
    useEffect(() => {
        const friendsListElement = friendsListRef.current
        if (!friendsListElement || !hasMoreFriends || isLoadingFriends || !clerkSession) return

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = friendsListElement
            // Load more when user scrolls to within 50px of bottom
            if (scrollHeight - scrollTop - clientHeight < 50) {
                fetchFriendsList(false)
            }
        }

        friendsListElement.addEventListener('scroll', handleScroll)
        return () => friendsListElement.removeEventListener('scroll', handleScroll)
    }, [hasMoreFriends, isLoadingFriends, clerkSession, friendsOffset])

    const respondToRequest = async (requestId: string, status: 'accepted' | 'rejected') => {
        if (!clerkSession) return

        try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            if (!token) return

            const response = await fetch('/api/friends?action=respond', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ request_id: requestId, status })
            })

            if (response.ok) {
                // Invalidate cache
                if (clerkUser) {
                    invalidateCache(getCacheKey('friends:requests', clerkUser.id, '*'))
                    invalidateCache(getCacheKey('friends:list', clerkUser.id, '*'))
                }
                await fetchFriendRequests()
                // Refresh friends list if accepted (reset to start)
                if (status === 'accepted') {
                    await fetchFriendsList(true)
                }
            } else {
                const error = await response.json()
                alert(error.error || 'Failed to respond to friend request')
            }
        } catch (error) {
            console.error('Error responding to friend request:', error)
            alert('Failed to respond to friend request')
        }
    }

    // Search users when query changes (debounced)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (friendSearchQuery) {
                searchUsers(friendSearchQuery)
            } else {
                setSearchResults([])
            }
        }, 300)

        return () => clearTimeout(timeoutId)
    }, [friendSearchQuery, clerkSession])

    // Fetch friend requests and friends list when user is logged in (preload)
    useEffect(() => {
        if (clerkSession) {
            fetchFriendRequests()
            fetchFriendsList()
        }
    }, [clerkSession])

    const handleSaveEdit = async (session: Session, e?: React.MouseEvent) => {
        if (e) e.stopPropagation()

        if (!clerkSession || !session.id) return

        try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            if (!token) {
                console.error('No token available')
                return
            }

            const response = await fetch('/api/sessions', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    id: session.id,
                    title: editingTitle.trim() || 'Untitled Session'
                })
            })

            if (response.ok) {
                // Invalidate cache (all paginated results)
                if (clerkUser) {
                    // Invalidate all session cache entries for this user
                    invalidateCache(getCacheKey('sessions', clerkUser.id) + '*')
                }
                // Update local state
                setSessions(sessions.map(s =>
                    s.id === session.id
                        ? { ...s, title: editingTitle.trim() || 'Untitled Session' }
                        : s
                ))
                setEditingSessionId(null)
                setEditingTitle('')
            } else {
                const error = await response.json()
                console.error('Error updating session title:', error)
                alert('Failed to update session title')
            }
        } catch (error) {
            console.error('Error updating session title:', error)
            alert('Failed to update session title')
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent, session: Session) => {
        if (e.key === 'Enter') {
            handleSaveEdit(session)
        } else if (e.key === 'Escape') {
            handleCancelEdit()
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diffTime = Math.abs(now.getTime() - date.getTime())
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

        // Format date and time
        const dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        })
        const timeStr = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        })

        if (diffDays === 0) return `Today at ${timeStr}`
        if (diffDays === 1) return `Yesterday at ${timeStr}`
        if (diffDays < 7) return `${diffDays} days ago at ${timeStr}`
        return `${dateStr} at ${timeStr}`
    }

    return (
        <>
            <motion.div
                ref={sidebarRef}
                initial={{ width: '80px' }}
                animate={{ width: isExpanded ? '400px' : '80px' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="fixed left-0 top-0 h-full bg-white/80 backdrop-blur-xl border-r border-gray-200 z-[100] flex flex-col overflow-hidden"
            >
                {/* Top Logo Area */}
                <div className="p-6 flex items-center gap-4">
                    <img 
                        src="/logo.png" 
                        alt="Logo" 
                        className="w-16 h-16 flex-shrink-0 object-contain"
                    />
                    <AnimatePresence>
                        {isExpanded && (
                            <motion.h1
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="text-2xl font-bold text-black whitespace-nowrap"
                            >
                                my sessions
                            </motion.h1>
                        )}
                    </AnimatePresence>
                </div>

                {/* Navigation Items */}
                <div className="flex-1 flex flex-col gap-8 px-6 mt-8">
                    {/* History Icon */}
                    <div className="flex flex-col">
                        <Tooltip
                            content="Session history"
                            placement="right"
                            classNames={{
                                content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                            }}
                        >
                            <button
                                onClick={() => {
                                    if (!isExpanded) {
                                        setIsExpanded(true)
                                    }
                                    setShowHistory(!showHistory)
                                }}
                                className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors"
                            >
                                <Clock className="w-6 h-6 flex-shrink-0" />
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="flex items-center justify-between flex-1"
                                        >
                                            <span className="whitespace-nowrap font-medium">History</span>
                                            <ChevronDown
                                                className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </button>
                        </Tooltip>

                        {/* History List */}
                        <AnimatePresence>
                            {isExpanded && showHistory && (
                                <motion.div
                                    ref={sessionsListRef}
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="ml-10 mt-2 space-y-2 max-h-64 overflow-y-auto"
                                >
                                    {isLoadingSessions && sessions.length === 0 ? (
                                        <p className="text-xs text-gray-500">Loading sessions...</p>
                                    ) : sessions.length === 0 ? (
                                        <div className="text-xs text-gray-500">
                                            <p>No saved sessions</p>
                                            <button
                                                onClick={() => fetchSessions(true)}
                                                className="mt-2 text-blue-600 hover:text-blue-800 underline text-xs"
                                            >
                                                Refresh
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {sessions.map((session) => (
                                            <div
                                                key={session.id}
                                                className="w-full p-2 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 group"
                                            >
                                                {editingSessionId === session.id ? (
                                                    // Edit mode
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={editingTitle}
                                                            onChange={(e) => setEditingTitle(e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, session)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="flex-1 text-sm font-medium text-gray-900 px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={(e) => handleSaveEdit(session, e)}
                                                            className="p-1 text-green-600 hover:text-green-700 transition-colors"
                                                            title="Save"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleCancelEdit(e)}
                                                            className="p-1 text-red-600 hover:text-red-700 transition-colors"
                                                            title="Cancel"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    // View mode
                                                    <div
                                                        onClick={() => handleLoadSession(session)}
                                                        className="cursor-pointer"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                                    {session.title || 'Untitled Session'}
                                                                </p>
                                                                <p className="text-xs text-gray-500 mt-1">
                                                                    {formatDate(session.created_at)}
                                                                </p>
                                                                {session.matches_data && Array.isArray(session.matches_data) && (
                                                                    <p className="text-xs text-gray-400 mt-1">
                                                                        {session.matches_data.length} matches
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={(e) => handleStartEdit(session, e)}
                                                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 transition-all"
                                                                title="Edit session name"
                                                            >
                                                                <Edit2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            ))}
                                            {isLoadingSessions && sessions.length > 0 && (
                                                <div className="flex justify-center py-2">
                                                    <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Friends Icon */}
                    <div className="flex flex-col">
                        <Tooltip
                            content="Friends"
                            placement="right"
                            classNames={{
                                content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                            }}
                        >
                            <button
                                onClick={() => {
                                    if (!isExpanded) {
                                        setIsExpanded(true)
                                    }
                                    setShowFriends(!showFriends)
                                }}
                                className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors"
                            >
                                <Users className="w-6 h-6 flex-shrink-0" />
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="flex items-center justify-between flex-1"
                                        >
                                            <span className="whitespace-nowrap font-medium">Friends</span>
                                            <ChevronDown
                                                className={`w-4 h-4 transition-transform ${showFriends ? 'rotate-180' : ''}`}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </button>
                        </Tooltip>

                        {/* Friends Section */}
                        <AnimatePresence>
                            {isExpanded && showFriends && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="ml-10 mt-2 space-y-4"
                                >
                                    {/* Search for users */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-700">Search Users</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={friendSearchQuery}
                                                onChange={(e) => setFriendSearchQuery(e.target.value)}
                                                placeholder="Search by username..."
                                                className="w-full px-3 py-2 text-sm text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            {isSearching && (
                                                <div className="absolute right-3 top-2.5">
                                                    <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Search Results */}
                                        {friendSearchQuery.length >= 2 && (
                                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                                {isSearching ? (
                                                    <p className="text-xs text-gray-500 py-2">Searching...</p>
                                                ) : searchResults.length > 0 ? (
                                                    searchResults.map((user) => (
                                                        <div
                                                            key={user.id}
                                                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100"
                                                        >
                                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                {user.avatar_url ? (
                                                                    <img
                                                                        src={user.avatar_url}
                                                                        alt={user.username}
                                                                        className="w-6 h-6 rounded-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center">
                                                                        <User className="w-4 h-4 text-gray-600" />
                                                                    </div>
                                                                )}
                                                                <span className="text-sm font-medium text-gray-900 truncate">
                                                                    {user.username}
                                                                </span>
                                                            </div>
                                                            <button
                                                                onClick={() => sendFriendRequest(user.id)}
                                                                className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                                                                title="Send friend request"
                                                            >
                                                                <UserPlus className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-xs text-gray-500 py-2">
                                                        No users found. Make sure the user has set a username in their profile.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Friends List */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-medium text-gray-700">My Friends</label>
                                            {friendsList.length > 0 && (
                                                <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                                                    {friendsList.length}
                                                </span>
                                            )}
                                        </div>

                                        {isLoadingFriends ? (
                                            <p className="text-xs text-gray-500">Loading...</p>
                                        ) : friendsList.length === 0 ? (
                                            <p className="text-xs text-gray-500">No friends yet</p>
                                        ) : (
                                            <div
                                                ref={friendsListRef}
                                                className="space-y-2 max-h-48 overflow-y-auto"
                                            >
                                                {friendsList.map((friend) => (
                                                    <div
                                                        key={friend.id}
                                                        className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100"
                                                    >
                                                        {friend.friend.avatar_url ? (
                                                            <img
                                                                src={friend.friend.avatar_url}
                                                                alt={friend.friend.username}
                                                                className="w-6 h-6 rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center">
                                                                <User className="w-4 h-4 text-gray-600" />
                                                            </div>
                                                        )}
                                                        <span className="text-sm font-medium text-gray-900 truncate flex-1">
                                                            {friend.friend.username}
                                                        </span>
                                                    </div>
                                                ))}
                                                {isLoadingFriends && (
                                                    <div className="flex justify-center py-2">
                                                        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Friend Requests */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-medium text-gray-700">Friend Requests</label>
                                            {friendRequests.length > 0 && (
                                                <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                                                    {friendRequests.length}
                                                </span>
                                            )}
                                        </div>

                                        {isLoadingRequests ? (
                                            <p className="text-xs text-gray-500">Loading...</p>
                                        ) : friendRequests.length === 0 ? (
                                            <p className="text-xs text-gray-500">No pending requests</p>
                                        ) : (
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {friendRequests.map((request) => (
                                                    <div
                                                        key={request.id}
                                                        className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                                                    >
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            {request.friend.avatar_url ? (
                                                                <img
                                                                    src={request.friend.avatar_url}
                                                                    alt={request.friend.username}
                                                                    className="w-6 h-6 rounded-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center">
                                                                    <User className="w-4 h-4 text-gray-600" />
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                                    {request.friend.username}
                                                                </p>
                                                                <p className="text-xs text-gray-500">
                                                                    {request.isRequester ? 'Sent' : 'Received'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {!request.isRequester && (
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => respondToRequest(request.id, 'accepted')}
                                                                    className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                                                                    title="Accept"
                                                                >
                                                                    <UserCheck className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => respondToRequest(request.id, 'rejected')}
                                                                    className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                                                    title="Reject"
                                                                >
                                                                    <UserX className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Projects Icon */}
                    <div className="flex flex-col">
                        <Tooltip
                            content="Projects"
                            placement="right"
                            classNames={{
                                content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                            }}
                        >
                            <button
                                onClick={() => {
                                    if (!isExpanded) {
                                        setIsExpanded(true)
                                    }
                                    setShowProjects(!showProjects)
                                }}
                                className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors"
                            >
                                <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                                    <CurateSessionIcon className="w-6 h-6" />
                                </div>
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="flex items-center justify-between flex-1"
                                        >
                                            <span className="whitespace-nowrap font-medium">Projects</span>
                                            <ChevronDown
                                                className={`w-4 h-4 transition-transform ${showProjects ? 'rotate-180' : ''}`}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </button>
                        </Tooltip>

                        {/* Projects List */}
                        <AnimatePresence>
                            {isExpanded && showProjects && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="ml-10 mt-2 space-y-2"
                                >
                                    {/* Create Project Button */}
                                    <button
                                        onClick={() => setShowCreateProject(true)}
                                        className="w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors border border-gray-200 flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Create New Project
                                    </button>

                                    {/* Projects List */}
                                    {isLoadingProjects ? (
                                        <p className="text-xs text-gray-500">Loading projects...</p>
                                    ) : projects.length === 0 ? (
                                        <p className="text-xs text-gray-500">No projects yet</p>
                                    ) : (
                                        <div className="space-y-1 max-h-64 overflow-y-auto">
                                            {projects.map((project) => (
                                                <button
                                                    key={project.id}
                                                    onClick={() => {
                                                        setSelectedProject(project)
                                                        setShowEditProject(true)
                                                    }}
                                                    className="w-full px-3 py-2 text-left text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 group"
                                                >
                                                    <p className="font-medium text-gray-900 truncate">
                                                        {project.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        {new Date(project.created_at).toLocaleDateString()}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Expanded Content Area */}
                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="mt-4 flex-1 flex flex-col"
                            >
                                {/* Controls */}
                                <div className="flex items-center justify-between mb-8 text-sm text-gray-600">
                                    <button className="flex items-center gap-2 hover:text-black">
                                        <Search className="w-4 h-4" />
                                        Find
                                    </button>
                                    <button className="flex items-center gap-1 hover:text-black">
                                        Sort
                                        <AlignLeft className="w-4 h-4 rotate-180" />
                                    </button>
                                </div>

                                {/* Empty State */}
                                <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500">
                                    <h3 className="text-lg font-medium text-black mb-2">No saved spirals yet</h3>
                                    <p className="text-sm max-w-[200px]">
                                        Save your favorite spirals to access them quickly here.
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Bottom Actions */}
                <div className="p-6 flex flex-col gap-6">
                    <Tooltip
                        content="Settings"
                        placement="right"
                        classNames={{
                            content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                        }}
                    >
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors"
                        >
                            <Settings className="w-6 h-6 flex-shrink-0" />
                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.span
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="whitespace-nowrap font-medium"
                                    >
                                        Settings
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </button>
                    </Tooltip>

                    <Tooltip
                        content="Profile"
                        placement="right"
                        classNames={{
                            content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                        }}
                    >
                        <button className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 border-2 border-gray-300 relative">
                                {avatarUrl ? (
                                    <img
                                        key={`avatar-${avatarUrl}-${avatarKey}`}
                                        src={`${avatarUrl}${avatarUrl.includes('?') ? '&' : '?'}_t=${avatarKey}`}
                                        alt="Profile"
                                        className="w-full h-full object-cover block"
                                        style={{ display: 'block' }}
                                        onLoad={() => {
                                            console.log('✅ Profile image loaded successfully in sidebar:', avatarUrl)
                                        }}
                                        onError={(e) => {
                                            // Fallback to default avatar if image fails to load
                                            console.error('❌ Profile image failed to load:', avatarUrl)
                                            console.error('Image error details:', e)
                                            const target = e.target as HTMLImageElement
                                            // Try Clerk image first, then fallback to generated avatar
                                            if (clerkUser?.imageUrl) {
                                                target.src = clerkUser.imageUrl
                                            } else {
                                                target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
                                            }
                                        }}
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                        <User className="w-5 h-5 text-gray-400" />
                                    </div>
                                )}
                            </div>
                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="text-left"
                                    >
                                        <div className="text-sm font-medium text-black">{username}</div>
                                        <div className="text-xs text-gray-500">View Profile</div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </button>
                    </Tooltip>

                    {/* Auth Button */}
                    <div className="pt-4 border-t border-gray-200">
                        <AuthButton isSidebarExpanded={isExpanded} />
                    </div>
                </div>

                {/* Settings Modal - rendered via portal at body level */}
                <SettingsModal
                    open={isSettingsOpen}
                    onOpenChange={setIsSettingsOpen}
                    username={username}
                    avatarUrl={avatarUrl || undefined}
                />
            </motion.div>

            {/* Floating Messages Button - Bottom Right */}
            <motion.button
                onClick={() => setShowMessages(true)}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="fixed bottom-6 right-6 w-14 h-14 bg-white text-gray-900 rounded-full shadow-lg hover:shadow-xl flex items-center justify-center z-[9998] transition-all duration-200 border border-gray-200"
                aria-label="Open Messages"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-6 h-6">
                    <rect width="256" height="256" fill="none" />
                    <line x1="108" y1="148" x2="160" y2="96" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
                    <path d="M223.69,42.18a8,8,0,0,0-9.87-9.87l-192,58.22a8,8,0,0,0-1.25,14.93L108,148l42.54,87.42a8,8,0,0,0,14.93-1.25Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16" />
                </svg>
            </motion.button>

            {/* Messages Panel - rendered outside sidebar */}
            <AnimatePresence>
                {showMessages && (
                    <MessagesPanel
                        friends={friendsList}
                        onClose={() => setShowMessages(false)}
                    />
                )}
            </AnimatePresence>

            {/* Create Project Modal */}
            <CreateProjectModal
                isOpen={showCreateProject}
                onClose={() => setShowCreateProject(false)}
                onSuccess={() => {
                    // Invalidate cache
                    if (clerkUser) {
                        invalidateCache(getCacheKey('projects', clerkUser.id))
                    }
                    fetchProjects()
                    console.log('Project created successfully')
                }}
            />

            {/* Edit Project Modal */}
            <EditProjectModal
                isOpen={showEditProject}
                onClose={() => {
                    setShowEditProject(false)
                    setSelectedProject(null)
                }}
                project={selectedProject}
                onSuccess={() => {
                    // Invalidate cache
                    if (clerkUser) {
                        invalidateCache(getCacheKey('projects', clerkUser.id))
                    }
                    fetchProjects()
                    console.log('Project updated successfully')
                }}
            />
        </>
    )
}
