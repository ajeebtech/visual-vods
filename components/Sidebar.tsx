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
import { supabase } from '@/lib/supabase'

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

export default function Sidebar() {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [username, setUsername] = useState<string>('User Name')
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const sidebarRef = useRef<HTMLDivElement>(null)

    // Debug: Log when avatarUrl changes
    useEffect(() => {
        console.log('🔄 avatarUrl state changed:', avatarUrl)
    }, [avatarUrl])

    // Fetch user profile data
    const fetchUserProfile = async () => {
        try {
            console.log('📥 Fetching user profile...')
            const { data: { user } } = await supabase.auth.getUser()
            console.log('User fetched:', { id: user?.id, metadata: user?.user_metadata })
            
            if (user) {
                // First, try to fetch from profiles table (highest priority - user's saved custom username)
                let savedUsername: string | null = null
                let savedAvatar: string | null = null
                
                try {
                    const { data: profileData, error: profileError } = await supabase
                        .from('profiles')
                        .select('username, avatar_url')
                        .eq('id', user.id)
                        .single()

                    if (!profileError && profileData) {
                        if (profileData.username) savedUsername = profileData.username
                        if (profileData.avatar_url) savedAvatar = profileData.avatar_url
                    }
                } catch (err: any) {
                    // Profiles table doesn't exist or has RLS issues - that's okay
                    // 406 errors are expected if the table doesn't exist or has RLS restrictions
                    // Silently ignore these errors - we'll use user_metadata instead
                    if (err?.code !== 'PGRST116' && err?.status !== 406) {
                        console.log('Profiles table not available, using user metadata only')
                    }
                }

                // Priority order for username:
                // 1. Saved username from profiles table
                // 2. Saved display_name from user_metadata (user's custom name)
                // 3. Saved username from user_metadata
                // 4. Google OAuth full_name (fallback)
                // 5. Email username (fallback)
                const displayName = savedUsername || 
                                  user.user_metadata?.display_name || 
                                  user.user_metadata?.username || 
                                  user.user_metadata?.full_name || 
                                  user.email?.split('@')[0] || 
                                  'User Name'
                
                // Priority order for avatar:
                // 1. Saved avatar from profiles table
                // 2. custom_avatar_url from user_metadata (user's uploaded custom avatar - highest priority)
                // 3. avatar_url from user_metadata (but only if it's from Supabase Storage, not Google)
                // 4. Google OAuth picture (fallback)
                console.log('🔍 Avatar priority check:', {
                    savedAvatarFromTable: savedAvatar,
                    customAvatarUrl: user.user_metadata?.custom_avatar_url,
                    userMetadataAvatarUrl: user.user_metadata?.avatar_url,
                    userMetadataPicture: user.user_metadata?.picture,
                    fullUserMetadata: user.user_metadata
                })
                
                // Check if avatar_url is from Supabase Storage (not Google)
                const avatarUrl = user.user_metadata?.avatar_url
                const isSupabaseStorageUrl = avatarUrl && avatarUrl.includes('supabase.co/storage')
                
                let avatar = savedAvatar || 
                            user.user_metadata?.custom_avatar_url ||  // Custom uploaded avatar (highest priority)
                            (isSupabaseStorageUrl ? avatarUrl : null) ||  // Only use avatar_url if it's from Supabase
                            user.user_metadata?.picture ||  // Google picture as fallback
                            null
                
                console.log('🎯 Final avatar selected:', avatar, 'source:', 
                    savedAvatar ? 'profiles table' :
                    user.user_metadata?.custom_avatar_url ? 'user_metadata.custom_avatar_url (uploaded)' :
                    isSupabaseStorageUrl ? 'user_metadata.avatar_url (Supabase Storage)' :
                    user.user_metadata?.picture ? 'user_metadata.picture (Google)' :
                    'none')
                
                // If avatar is a storage path (not a full URL), convert it to a public URL
                if (avatar && !avatar.startsWith('http')) {
                    // It's a storage path, get the public URL
                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(avatar)
                    avatar = publicUrl
                }
                
                setUsername(displayName)
                setAvatarUrl(avatar)
                console.log('Profile loaded:', { 
                    displayName, 
                    avatar, 
                    hasAvatar: !!avatar,
                    avatarUrlState: avatar,
                    avatarLength: avatar?.length || 0,
                    userMetadata: user.user_metadata,
                    savedAvatarFromTable: savedAvatar,
                    finalAvatar: avatar
                })
                console.log('🔍 Setting avatarUrl state to:', avatar)
            } else {
                // No user, reset to defaults
                setUsername('User Name')
                setAvatarUrl(null)
            }
        } catch (error) {
            console.error('Error fetching user profile:', error)
        }
    }

    useEffect(() => {
        fetchUserProfile()

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                fetchUserProfile()
            } else {
                setUsername('User Name')
                setAvatarUrl(null)
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [])

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
        // Wait a moment for Supabase to sync the user metadata update
        await new Promise(resolve => setTimeout(resolve, 800))
        
        // Simply call fetchUserProfile to refresh everything
        await fetchUserProfile()
        console.log('✅ Profile refresh complete')
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
                {/* Spiral Icon / Toggle */}
                <Tooltip
                    content="Spirals"
                    placement="right"
                    classNames={{
                        content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                    }}
                >
                    <button
                        className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors group"
                    >
                        <SpiralIcon className="w-6 h-6 flex-shrink-0" />
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap font-medium"
                                >
                                    Spirals
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>

                {/* Library Icon */}
                <Tooltip
                    content="Library"
                    placement="right"
                    classNames={{
                        content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                    }}
                >
                    <button className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors">
                        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                            <div className="flex gap-1">
                                <div className="w-0.5 h-4 bg-current rounded-full" />
                                <div className="w-0.5 h-4 bg-current rounded-full" />
                                <div className="w-0.5 h-4 bg-current rounded-full" />
                            </div>
                        </div>
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap font-medium"
                                >
                                    Library
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>

                {/* History Icon */}
                <Tooltip
                    content="Spiral history"
                    placement="right"
                    classNames={{
                        content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                    }}
                >
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors"
                    >
                        <Clock className="w-6 h-6 flex-shrink-0" />
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap font-medium"
                                >
                                    History
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>

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
                        {/* Debug: Show current state */}
                        {process.env.NODE_ENV === 'development' && (
                            <div style={{ display: 'none' }}>
                                {console.log('🎨 Rendering profile button - avatarUrl:', avatarUrl, 'type:', typeof avatarUrl, 'isTruthy:', !!avatarUrl)}
                            </div>
                        )}
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 border-2 border-gray-300 relative">
                            {avatarUrl ? (
                                <img
                                    key={`avatar-${avatarUrl}`}
                                    src={avatarUrl}
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
                                        target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
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
