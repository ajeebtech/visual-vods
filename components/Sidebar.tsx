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
    User
} from 'lucide-react'
import SettingsModal from './SettingsModal'
import AuthButton from './AuthButton'
import { useSupabase } from '@/lib/supabase-client'
import { useUser, useSession } from '@clerk/nextjs'

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
    const [showHistory, setShowHistory] = useState(false)
    const sidebarRef = useRef<HTMLDivElement>(null)

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
                        const response = await fetch('/api/profile', {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        })

                        if (response.ok) {
                            const result = await response.json()
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
                                    // Fetch the newly created profile
                                    const fetchResponse = await fetch('/api/profile', {
                                        method: 'GET',
                                        headers: {
                                            'Authorization': `Bearer ${token}`
                                        }
                                    })
                                    if (fetchResponse.ok) {
                                        const fetchResult = await fetchResponse.json()
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

    // Fetch saved sessions
    const fetchSessions = async () => {
        if (!clerkUser || !clerkSession) {
            setIsLoadingSessions(false)
            return
        }

        setIsLoadingSessions(true)
        try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            
            if (!token) {
                console.warn('No token available for fetching sessions')
                setIsLoadingSessions(false)
                return
            }

            console.log('📥 Fetching sessions from API...')
            const response = await fetch('/api/sessions', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            console.log('📥 Sessions API response:', { status: response.status, ok: response.ok })

            if (response.ok) {
                const data = await response.json()
                console.log('📥 Fetched sessions:', data?.length || 0, 'sessions')
                setSessions(data || [])
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
            fetchSessions()
        }
    }, [isExpanded, showHistory, clerkUser, clerkSession])

    const handleLoadSession = (session: Session) => {
        if (onLoadSession) {
            onLoadSession(session)
            setIsExpanded(false)
            setShowHistory(false)
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diffTime = Math.abs(now.getTime() - date.getTime())
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        
        if (diffDays === 0) return 'Today'
        if (diffDays === 1) return 'Yesterday'
        if (diffDays < 7) return `${diffDays} days ago`
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
        return date.toLocaleDateString()
    }

    return (
        <motion.div
            ref={sidebarRef}
            initial={{ width: '80px' }}
            animate={{ width: isExpanded ? '400px' : '80px' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 h-full bg-white/80 backdrop-blur-xl border-r border-gray-200 z-[100] flex flex-col overflow-hidden"
        >
            {/* Top Logo Area */}
            <div className="p-6 flex items-center gap-4">
                <div className="w-8 h-8 bg-gradient-to-br from-gray-200 to-gray-400 rounded-full flex-shrink-0 shadow-inner" />
                <AnimatePresence>
                    {isExpanded && (
                        <motion.h1
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="text-2xl font-bold text-black whitespace-nowrap"
                        >
                            My Spirals
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
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="ml-10 mt-2 space-y-2 max-h-64 overflow-y-auto"
                            >
                                {isLoadingSessions ? (
                                    <p className="text-xs text-gray-500">Loading...</p>
                                ) : sessions.length === 0 ? (
                                    <p className="text-xs text-gray-500">No saved sessions</p>
                                ) : (
                                    sessions.map((session) => (
                                        <button
                                            key={session.id}
                                            onClick={() => handleLoadSession(session)}
                                            className="w-full text-left p-2 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                                        >
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
                                        </button>
                                    ))
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Messaging Icon */}
                <Tooltip
                    content="Messages"
                    placement="right"
                    classNames={{
                        content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                    }}
                >
                    <button className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors">
                        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                            <MessagingIcon className="w-6 h-6" />
                        </div>
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap font-medium"
                                >
                                    Messages
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>

                {/* Curate Session Icon */}
                <Tooltip
                    content="Curate a session"
                    placement="right"
                    classNames={{
                        content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                    }}
                >
                    <button className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors">
                        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                            <CurateSessionIcon className="w-6 h-6" />
                        </div>
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap font-medium"
                                >
                                    Curate a session
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>

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
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                currentUsername={username}
                currentAvatarUrl={avatarUrl || undefined}
                onUpdate={handleSettingsUpdate}
            />
        </motion.div>
    )
}
