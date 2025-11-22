"use client"

import * as React from "react"
import { User, Upload } from "lucide-react"
import { useSession } from "@clerk/nextjs"
import { useSupabase } from "@/lib/supabase-client"
import { motion, AnimatePresence } from "framer-motion"

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
    title: "Profile",
    icon: User,
    value: "profile",
  },
]

export function SettingsModal({ open, onOpenChange, trigger, username, avatarUrl, onUpdate }: SettingsModalProps) {
  const [activeTab, setActiveTab] = React.useState("profile")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <>{trigger}</>}
      <DialogContent className="max-w-4xl gap-0 p-0 overflow-hidden h-[75vh] md:h-[600px] bg-gray-50 border-0 rounded-2xl [&>button]:hidden">
        <div className="flex h-full rounded-2xl overflow-hidden">
          {/* Left Sidebar - Light mode */}
          <div className="w-60 bg-white border-r border-gray-200 flex flex-col relative rounded-l-2xl">
            <div className="p-4 border-b border-gray-200 rounded-tl-2xl">
              <h2 className="text-base font-semibold text-gray-900">User Settings</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="flex flex-col gap-1">
                {sidebarNavItems.map((item, index) => (
                  <motion.button
                  key={item.value}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.2 }}
                  onClick={() => setActiveTab(item.value)}
                  className={cn(
                      "relative flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-200",
                    activeTab === item.value
                        ? "bg-indigo-50 text-indigo-600 font-medium"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                    whileHover={{ scale: 1.02, x: 4 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {activeTab === item.value && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-600 rounded-r-full"
                        initial={false}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                    <item.icon className="h-5 w-5 flex-shrink-0 relative z-10" />
                    <span className="text-sm relative z-10">{item.title}</span>
                  </motion.button>
              ))}
              </div>
            </div>
          </div>

          {/* Right Content Area - Light mode */}
          <div className="flex-1 flex flex-col min-w-0 bg-gray-50 rounded-r-2xl">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="p-6 border-b border-gray-200 rounded-tr-2xl"
            >
              <h2 className="text-2xl font-bold text-gray-900">
                {sidebarNavItems.find(item => item.value === activeTab)?.title || "Settings"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Manage your profile settings and preferences
              </p>
            </motion.div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-6 max-w-3xl">
                <AnimatePresence mode="wait">
                  {activeTab === "profile" && (
                    <motion.div
                      key="profile"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ProfileSettings username={username} avatarUrl={avatarUrl} onUpdate={onUpdate} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    <div className="space-y-6">
      {/* Message Display */}
      <AnimatePresence>
      {message && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`p-4 rounded-xl border ${
          message.type === 'success' 
                ? 'bg-green-50 text-green-700 border-green-200' 
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
          <p className="text-sm font-medium">{message.text}</p>
          </motion.div>
      )}
      </AnimatePresence>

      {/* Picture Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="bg-white rounded-xl p-6 border border-gray-200"
      >
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4 block">Picture</Label>
        <div className="flex items-center gap-6">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <Avatar className="h-20 w-20 ring-4 ring-gray-100 cursor-pointer">
            {currentAvatarUrl ? (
              <AvatarImage src={currentAvatarUrl} alt="Profile picture" />
            ) : null}
              <AvatarFallback className="bg-indigo-500 text-white text-xl font-semibold">
              {currentUsername ? currentUsername.substring(0, 2).toUpperCase() : 'JD'}
            </AvatarFallback>
          </Avatar>
          </motion.div>
          <div className="flex flex-col gap-3">
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
                className="w-fit bg-indigo-600 text-white hover:bg-indigo-700 transition-colors rounded-lg"
            >
              <Upload className="w-4 h-4 mr-2" />
                {isUploading ? 'Uploading...' : 'Change Avatar'}
            </Button>
            </motion.div>
            <p className="text-xs text-gray-500">JPG, PNG or GIF. Max size 5MB</p>
          </div>
        </div>
      </motion.div>

      {/* Username Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="bg-white rounded-xl p-6 border border-gray-200"
      >
        <Label htmlFor="username" className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4 block">
          Username
        </Label>
        <Input
          id="username"
          value={currentUsername}
          onChange={(e) => setCurrentUsername(e.target.value)}
          placeholder="Enter your username"
          className="max-w-md bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg"
        />
        <p className="text-xs text-gray-500 mt-2">This is your display name on the platform</p>
      </motion.div>

      {/* Save Changes Button */}
      <div className="pt-2">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
        <Button
          onClick={handleSaveChanges}
          disabled={isSaving}
            className="bg-indigo-600 text-white hover:bg-indigo-700 transition-colors rounded-lg"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
        </motion.div>
      </div>
    </div>
  )
}

