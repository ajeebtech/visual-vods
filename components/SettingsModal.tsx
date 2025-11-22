"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Settings, User, Bell, Shield, X, Upload, Check, AlertCircle, Loader2 } from "lucide-react"
import { useSession } from "@clerk/nextjs"
import { useSupabase } from "@/lib/supabase-client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface SettingsModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
  username?: string
  avatarUrl?: string
  onUpdate?: () => void
}

const sidebarNavItems = [
  {
    title: "General",
    icon: Settings,
    value: "general",
    description: "App preferences and behavior",
  },
  {
    title: "Profile",
    icon: User,
    value: "profile",
    description: "Your account information",
  },
  {
    title: "Notifications",
    icon: Bell,
    value: "notifications",
    description: "Alert and notification settings",
  },
  {
    title: "Security",
    icon: Shield,
    value: "security",
    description: "Privacy and security options",
  },
]

export function SettingsModal({ open, onOpenChange, trigger, username, avatarUrl, onUpdate }: SettingsModalProps) {
  const [activeTab, setActiveTab] = React.useState("profile")

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15, ease: "easeIn" } }
  }

  const sidebarVariants = {
    hidden: { x: -20, opacity: 0 },
    visible: { x: 0, opacity: 1, transition: { duration: 0.3, delay: 0.1, ease: "easeOut" } }
  }

  const contentVariants = {
    hidden: { x: 20, opacity: 0 },
    visible: { x: 0, opacity: 1, transition: { duration: 0.3, delay: 0.15, ease: "easeOut" } }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <>{trigger}</>}
      <DialogContent className="max-w-5xl gap-0 p-0 overflow-hidden h-[85vh] md:h-[700px] bg-gray-950 border-gray-800">
        <AnimatePresence mode="wait">
          {open && (
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex h-full"
            >
              {/* Left Sidebar */}
              <motion.div
                variants={sidebarVariants}
                initial="hidden"
                animate="visible"
                className="hidden md:flex md:w-80 flex-col border-r border-gray-800 bg-gray-900/30 backdrop-blur-sm"
              >
                <div className="p-8 pb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h2 className="text-2xl font-bold text-white">Settings</h2>
                      <p className="text-sm text-gray-400 mt-1">Manage your account preferences</p>
                    </div>
                    <button
                      onClick={() => onOpenChange?.(false)}
                      className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-800/50"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 px-6 pb-6 space-y-1 overflow-y-auto no-scrollbar">
                  {sidebarNavItems.map((item) => (
                    <motion.button
                      key={item.value}
                      onClick={() => setActiveTab(item.value)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "w-full flex items-start gap-4 px-4 py-4 rounded-xl text-left transition-all duration-200 group",
                        activeTab === item.value
                          ? "bg-blue-600/20 text-white border border-blue-500/30"
                          : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-lg transition-colors",
                        activeTab === item.value
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-gray-800/50 text-gray-500 group-hover:bg-gray-700/50 group-hover:text-gray-400"
                      )}>
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white">{item.title}</div>
                        <div className="text-sm text-gray-500 mt-0.5">{item.description}</div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {/* Mobile Header */}
              <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
                <h2 className="text-xl font-bold text-white">Settings</h2>
                <button
                  onClick={() => onOpenChange?.(false)}
                  className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-800/50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Tab Navigation */}
              <div className="md:hidden flex gap-2 p-4 border-b border-gray-800 overflow-x-auto no-scrollbar">
                {sidebarNavItems.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setActiveTab(item.value)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors",
                      activeTab === item.value
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.title}
                  </button>
                ))}
              </div>

              {/* Right Content Area */}
              <motion.div
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                className="flex-1 flex flex-col min-w-0 bg-gray-950"
              >
                <div className="hidden md:block p-8 border-b border-gray-800">
                  <motion.h2 
                    key={activeTab}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-2xl font-bold text-white"
                  >
                    {sidebarNavItems.find(item => item.value === activeTab)?.title || "Settings"}
                  </motion.h2>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar">
                  <div className="p-6 md:p-8 max-w-4xl mx-auto">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        {activeTab === "general" && <GeneralSettings />}
                        {activeTab === "profile" && <ProfileSettings username={username} avatarUrl={avatarUrl} onUpdate={onUpdate} />}
                        {activeTab === "notifications" && <NotificationSettings />}
                        {activeTab === "security" && <SecuritySettings />}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

function GeneralSettings() {
  return (
    <motion.div 
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Appearance</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium">Dark Mode</div>
              <div className="text-sm text-gray-400 mt-1">Use dark theme across the application</div>
            </div>
            <div className="w-12 h-6 bg-blue-600 rounded-full relative">
              <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Language & Region</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Language</label>
            <select className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors">
              <option>English (US)</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Timezone</label>
            <select className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors">
              <option>UTC-5 (Eastern Time)</option>
              <option>UTC-8 (Pacific Time)</option>
              <option>UTC+0 (London)</option>
              <option>UTC+1 (Paris)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Performance</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium">Hardware Acceleration</div>
              <div className="text-sm text-gray-400 mt-1">Use GPU for improved performance</div>
            </div>
            <div className="w-12 h-6 bg-gray-700 rounded-full relative">
              <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-gray-400 rounded-full shadow-sm"></div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium">Reduced Motion</div>
              <div className="text-sm text-gray-400 mt-1">Minimize animations and transitions</div>
            </div>
            <div className="w-12 h-6 bg-gray-700 rounded-full relative">
              <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-gray-400 rounded-full shadow-sm"></div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function ProfileSettings({ username, avatarUrl, onUpdate }: { username?: string; avatarUrl?: string; onUpdate?: () => void }) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { session: clerkSession } = useSession()
  const { supabase } = useSupabase()
  const [isUploading, setIsUploading] = React.useState(false)
  const [currentAvatarUrl, setCurrentAvatarUrl] = React.useState(avatarUrl)
  const [currentUsername, setCurrentUsername] = React.useState(username || "")
  const [isSaving, setIsSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ text: string; type: 'success' | 'error' } | null>(null)

  React.useEffect(() => {
    setCurrentAvatarUrl(avatarUrl)
    setCurrentUsername(username || "")
  }, [avatarUrl, username])

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage({ text: 'Please select an image file', type: 'error' })
      setTimeout(() => setMessage(null), 5000)
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ text: 'Image size must be less than 5MB', type: 'error' })
      setTimeout(() => setMessage(null), 5000)
      return
    }

    setIsUploading(true)

    try {
      if (!clerkSession || !supabase) {
        throw new Error('Session or Supabase client not available')
      }

      const userId = clerkSession.user?.id
      if (!userId) {
        throw new Error('User ID not found')
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${userId}-${Date.now()}.${fileExt}`
      const filePath = fileName

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        throw uploadError
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update profile with new avatar URL
      const token = await clerkSession.getToken({ template: 'supabase' })
      if (!token) {
        throw new Error('Could not get authentication token')
      }

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          avatar_url: publicUrl
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update profile')
      }

      // Update local state
      setCurrentAvatarUrl(publicUrl)
      onUpdate?.()
      setMessage({ text: 'Profile picture uploaded successfully!', type: 'success' })
      setTimeout(() => setMessage(null), 5000)
    } catch (error: any) {
      console.error('Error uploading avatar:', error)
      setMessage({ text: `Error uploading avatar: ${error.message || 'Unknown error'}`, type: 'error' })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleSaveChanges = async () => {
    if (!clerkSession) {
      setMessage({ text: 'Session not available', type: 'error' })
      setTimeout(() => setMessage(null), 5000)
      return
    }

    setIsSaving(true)

    try {
      const token = await clerkSession.getToken({ template: 'supabase' })
      if (!token) {
        throw new Error('Could not get authentication token')
      }

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: currentUsername.trim() || null
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update profile')
      }

      onUpdate?.()
      setMessage({ text: 'Profile updated successfully!', type: 'success' })
      setTimeout(() => setMessage(null), 5000)
    } catch (error: any) {
      console.error('Error saving profile:', error)
      setMessage({ text: `Error saving profile: ${error.message || 'Unknown error'}`, type: 'error' })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <motion.div 
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Message Display */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-xl border flex items-center gap-3 ${
              message.type === 'success' 
                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}
          >
            {message.type === 'success' ? (
              <Check className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="text-sm font-medium">{message.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Picture Section */}
      <motion.div 
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-lg font-semibold text-white mb-6">Profile Picture</h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <motion.div 
            className="relative group"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <Avatar className="h-28 w-28 border-4 border-gray-800 shadow-xl">
              {currentAvatarUrl ? (
                <AvatarImage src={currentAvatarUrl} alt="Profile picture" />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-white text-2xl font-bold">
                {currentUsername ? currentUsername.substring(0, 2).toUpperCase() : 'JD'}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Upload className="w-6 h-6 text-white" />
            </div>
          </motion.div>
          
          <div className="flex-1 space-y-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                disabled={isUploading}
              />
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={handleAvatarClick}
                  disabled={isUploading}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 transition-all duration-200"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload New Picture
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
            <div className="text-sm text-gray-400 space-y-1">
              <p>JPG, PNG or GIF format</p>
              <p>Maximum file size: 5MB</p>
              <p>Recommended: 400x400px or higher</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Username Section */}
      <motion.div 
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="text-lg font-semibold text-white mb-6">Username</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
              Display Name
            </label>
            <Input
              id="username"
              value={currentUsername}
              onChange={(e) => setCurrentUsername(e.target.value)}
              placeholder="Enter your username"
              className="max-w-md bg-gray-800/50 border-gray-700 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
            />
          </div>
          <div className="text-sm text-gray-400">
            <p>This is how others will see you on the platform.</p>
            <p>You can change this at any time.</p>
          </div>
        </div>
      </motion.div>

      {/* Account Information */}
      <motion.div 
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-lg font-semibold text-white mb-6">Account Information</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-800">
            <div>
              <div className="text-white font-medium">Email</div>
              <div className="text-sm text-gray-400">Your account email address</div>
            </div>
            <div className="text-sm text-gray-500">
              {clerkSession?.user?.primaryEmailAddress?.emailAddress || 'Loading...'}
            </div>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-gray-800">
            <div>
              <div className="text-white font-medium">Member Since</div>
              <div className="text-sm text-gray-400">When you joined the platform</div>
            </div>
            <div className="text-sm text-gray-500">
              {clerkSession?.user?.createdAt ? 
                new Date(clerkSession.user.createdAt).toLocaleDateString() : 
                'Loading...'
              }
            </div>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-white font-medium">Account ID</div>
              <div className="text-sm text-gray-400">Your unique account identifier</div>
            </div>
            <div className="text-sm font-mono text-gray-500">
              {clerkSession?.user?.id?.substring(0, 8) || 'Loading...'}...
            </div>
          </div>
        </div>
      </motion.div>

      {/* Save Changes Button */}
      <motion.div 
        className="flex justify-end pt-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={handleSaveChanges}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 transition-all duration-200 px-8"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function NotificationSettings() {
  const [emailNotifications, setEmailNotifications] = React.useState({
    newMessages: true,
    projectUpdates: true,
    friendRequests: true,
    weeklyDigest: false
  })

  const [pushNotifications, setPushNotifications] = React.useState({
    newMessages: true,
    projectUpdates: false,
    friendRequests: true,
    mentions: true
  })

  return (
    <motion.div 
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div 
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-lg font-semibold text-white mb-6">Email Notifications</h3>
        <div className="space-y-4">
          {Object.entries({
            newMessages: { label: 'New Messages', description: 'Get notified when someone sends you a message' },
            projectUpdates: { label: 'Project Updates', description: 'Updates about your projects and sessions' },
            friendRequests: { label: 'Friend Requests', description: 'When someone wants to connect with you' },
            weeklyDigest: { label: 'Weekly Digest', description: 'Summary of your weekly activity' }
          }).map(([key, config]) => {
            const typedKey = key as keyof typeof emailNotifications
            return (
            <motion.div 
              key={key}
              className="flex items-center justify-between py-3"
              whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex-1">
                <div className="text-white font-medium">{config.label}</div>
                <div className="text-sm text-gray-400 mt-0.5">{config.description}</div>
              </div>
              <motion.button
                onClick={() => setEmailNotifications(prev => ({ ...prev, [typedKey]: !prev[typedKey] }))}
                className="relative w-12 h-6 rounded-full transition-colors duration-200"
                style={{ backgroundColor: emailNotifications[typedKey] ? '#3B82F6' : '#374151' }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm"
                  animate={{ x: emailNotifications[typedKey] ? 24 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </motion.button>
            </motion.div>
            )
          })}
        </div>
      </motion.div>

      <motion.div 
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="text-lg font-semibold text-white mb-6">Push Notifications</h3>
        <div className="space-y-4">
          {Object.entries({
            newMessages: { label: 'New Messages', description: 'Real-time message notifications' },
            projectUpdates: { label: 'Project Updates', description: 'Important project changes' },
            friendRequests: { label: 'Friend Requests', description: 'New connection requests' },
            mentions: { label: 'Mentions', description: 'When someone mentions you' }
          }).map(([key, config]) => {
            const typedKey = key as keyof typeof pushNotifications
            return (
            <motion.div 
              key={key}
              className="flex items-center justify-between py-3"
              whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex-1">
                <div className="text-white font-medium">{config.label}</div>
                <div className="text-sm text-gray-400 mt-0.5">{config.description}</div>
              </div>
              <motion.button
                onClick={() => setPushNotifications(prev => ({ ...prev, [typedKey]: !prev[typedKey] }))}
                className="relative w-12 h-6 rounded-full transition-colors duration-200"
                style={{ backgroundColor: pushNotifications[typedKey] ? '#3B82F6' : '#374151' }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm"
                  animate={{ x: pushNotifications[typedKey] ? 24 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </motion.button>
            </motion.div>
            )
          })}
        </div>
      </motion.div>

      <motion.div 
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-lg font-semibold text-white mb-6">Notification Schedule</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Quiet Hours</label>
            <div className="flex items-center gap-4">
              <input
                type="time"
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                defaultValue="22:00"
              />
              <span className="text-gray-400">to</span>
              <input
                type="time"
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                defaultValue="08:00"
              />
            </div>
            <p className="text-sm text-gray-400 mt-2">No notifications will be sent during these hours</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Timezone</label>
            <select className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors">
              <option>UTC-5 (Eastern Time)</option>
              <option>UTC-8 (Pacific Time)</option>
              <option>UTC+0 (London)</option>
              <option>UTC+1 (Paris)</option>
            </select>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function SecuritySettings() {
  const [twoFactorEnabled, setTwoFactorEnabled] = React.useState(false)
  const [sessionTimeout, setSessionTimeout] = React.useState('30')

  return (
    <motion.div 
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div 
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-lg font-semibold text-white mb-6">Two-Factor Authentication</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3">
            <div className="flex-1">
              <div className="text-white font-medium">Enable 2FA</div>
              <div className="text-sm text-gray-400 mt-0.5">Add an extra layer of security to your account</div>
            </div>
            <motion.button
              onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
              className="relative w-12 h-6 rounded-full transition-colors duration-200"
              style={{ backgroundColor: twoFactorEnabled ? '#3B82F6' : '#374151' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm"
                animate={{ x: twoFactorEnabled ? 24 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </motion.button>
          </div>
          {twoFactorEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-4 border-t border-gray-800"
            >
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-blue-400 font-medium">2FA is enabled</div>
                    <div className="text-sm text-blue-300/70">Your account is protected with an extra security layer</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                  View backup codes
                </button>
                <button className="text-sm text-red-400 hover:text-red-300 transition-colors ml-4">
                  Disable 2FA
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      <motion.div 
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="text-lg font-semibold text-white mb-6">Session Management</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Session Timeout</label>
            <select 
              value={sessionTimeout}
              onChange={(e) => setSessionTimeout(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="240">4 hours</option>
              <option value="1440">1 day</option>
            </select>
            <p className="text-sm text-gray-400 mt-2">Automatically log out after period of inactivity</p>
          </div>
        </div>
      </motion.div>

      <motion.div 
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-lg font-semibold text-white mb-6">Active Sessions</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <div className="w-6 h-6 bg-blue-500 rounded"></div>
              </div>
              <div>
                <div className="text-white font-medium">Current Session</div>
                <div className="text-sm text-gray-400">Chrome on macOS • Active now</div>
              </div>
            </div>
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">Current</span>
          </div>
          
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
                <div className="w-6 h-6 bg-gray-600 rounded"></div>
              </div>
              <div>
                <div className="text-white font-medium">Mobile App</div>
                <div className="text-sm text-gray-400">iOS • Last active 2 hours ago</div>
              </div>
            </div>
            <button className="text-sm text-red-400 hover:text-red-300 transition-colors">
              Revoke
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div 
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <h3 className="text-lg font-semibold text-white mb-6">Privacy</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-white font-medium">Profile Visibility</div>
              <div className="text-sm text-gray-400 mt-0.5">Control who can see your profile</div>
            </div>
            <select className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option>Everyone</option>
              <option>Friends Only</option>
              <option>Private</option>
            </select>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-white font-medium">Activity Status</div>
              <div className="text-sm text-gray-400 mt-0.5">Show when you're online</div>
            </div>
            <motion.button
              className="relative w-12 h-6 rounded-full transition-colors duration-200 bg-blue-600"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm"
                animate={{ x: 24 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
