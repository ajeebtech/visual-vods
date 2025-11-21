"use client"

import * as React from "react"
import { Settings, User, Bell, Shield, X, Upload } from "lucide-react"
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
  },
  {
    title: "Profile",
    icon: User,
    value: "profile",
  },
  {
    title: "Notifications",
    icon: Bell,
    value: "notifications",
  },
  {
    title: "Security",
    icon: Shield,
    value: "security",
  },
]

export function SettingsModal({ open, onOpenChange, trigger, username, avatarUrl, onUpdate }: SettingsModalProps) {
  const [activeTab, setActiveTab] = React.useState("profile")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <>{trigger}</>}
      <DialogContent className="max-w-4xl gap-0 p-0 overflow-hidden h-[80vh] md:h-[600px] bg-white">
        <div className="flex h-full">
          {/* Left Sidebar */}
          <div className="w-64 border-r border-gray-200 bg-white">
            <div className="p-6 pb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Settings</h2>
              <button
                onClick={() => onOpenChange?.(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-1 p-4 pt-0">
              {sidebarNavItems.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setActiveTab(item.value)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                    activeTab === item.value
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-sm">{item.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {sidebarNavItems.find(item => item.value === activeTab)?.title || "Settings"}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-6 max-w-2xl">
                {activeTab === "general" && <GeneralSettings />}
                {activeTab === "profile" && <ProfileSettings username={username} avatarUrl={avatarUrl} onUpdate={onUpdate} />}
                {activeTab === "notifications" && <NotificationSettings />}
                {activeTab === "security" && <SecuritySettings />}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GeneralSettings() {
  return (
    <div className="space-y-6">
      <p className="text-gray-600">General settings coming soon...</p>
    </div>
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
      alert('Session not available')
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
      alert('Profile updated successfully!')
    } catch (error: any) {
      console.error('Error saving profile:', error)
      alert(`Error saving profile: ${error.message || 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Message Display */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Picture Section */}
      <div className="space-y-4">
        <Label className="text-base font-medium text-gray-900">Picture</Label>
        <div className="flex items-center gap-6">
          <Avatar className="h-24 w-24">
            {currentAvatarUrl ? (
              <AvatarImage src={currentAvatarUrl} alt="Profile picture" />
            ) : null}
            <AvatarFallback className="bg-gray-200 text-gray-600 text-xl">
              {currentUsername ? currentUsername.substring(0, 2).toUpperCase() : 'JD'}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              disabled={isUploading}
            />
            <Button
              onClick={handleAvatarClick}
              disabled={isUploading}
              className="w-fit bg-gray-900 text-white hover:bg-gray-800"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? 'Uploading...' : 'Upload Image'}
            </Button>
            <p className="text-sm text-gray-500">JPG, PNG or GIF. Max size 5MB</p>
          </div>
        </div>
      </div>

      {/* Username Section */}
      <div className="space-y-4">
        <Label htmlFor="username" className="text-base font-medium text-gray-900">Username</Label>
        <Input
          id="username"
          value={currentUsername}
          onChange={(e) => setCurrentUsername(e.target.value)}
          placeholder="Enter your username"
          className="max-w-md"
        />
      </div>

      {/* Save Changes Button */}
      <div className="pt-4">
        <Button
          onClick={handleSaveChanges}
          disabled={isSaving}
          className="bg-gray-900 text-white hover:bg-gray-800"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

function NotificationSettings() {
  return (
    <div className="space-y-6">
      <p className="text-gray-600">Notification settings coming soon...</p>
    </div>
  )
}

function SecuritySettings() {
  return (
    <div className="space-y-6">
      <p className="text-gray-600">Security settings coming soon...</p>
    </div>
  )
}
