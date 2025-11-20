'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, User, Settings as SettingsIcon, Bell, Palette, Shield, UserCircle } from 'lucide-react'
import { useUser, useSession } from '@clerk/nextjs'
import { useSupabase } from '@/lib/supabase-client'

type SettingsTab = 'general' | 'profile' | 'notifications' | 'security'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentUsername?: string
  currentAvatarUrl?: string
  onUpdate?: () => void
}

export default function SettingsModal({
  isOpen,
  onClose,
  currentUsername = '',
  currentAvatarUrl,
  onUpdate
}: SettingsModalProps) {
  const { user: clerkUser } = useUser()
  const { session: clerkSession } = useSession()
  const { supabase } = useSupabase()
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [username, setUsername] = useState(currentUsername)
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl || '')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setUsername(currentUsername)
    setAvatarUrl(currentAvatarUrl || '')
  }, [currentUsername, currentAvatarUrl, isOpen])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB')
      return
    }

    setUploading(true)
    setError(null)

    try {
      if (!clerkUser || !supabase) {
        setError('You must be logged in to upload a profile picture')
        setUploading(false)
        return
      }

      // Try to list buckets - if it fails or returns empty, we'll try uploading anyway
      // (The bucket might exist but we don't have permission to list buckets)
      let buckets: any[] = []
      const { data: bucketsData, error: listError } = await supabase.storage.listBuckets()
      
      if (listError) {
        console.warn('Could not list buckets (might be permission issue):', listError)
        // Continue anyway - we'll try to upload and see what error we get
      } else {
        buckets = bucketsData || []
      }

      console.log('Available buckets:', buckets?.map(b => b.name) || '[] (might be permission issue)')

      const avatarsBucket = buckets?.find(b => b.name === 'avatars')
      
      // If we can't list buckets or the list is empty, we'll try uploading anyway
      // The bucket might exist but we just don't have permission to list it
      if (buckets.length === 0) {
        console.log('Bucket list is empty - this might be a permissions issue. Attempting upload anyway...')
        // Don't return - continue to try uploading
      } else if (buckets.length > 0 && !avatarsBucket) {
        setError(
          'Storage bucket "avatars" not found. Found buckets: ' + buckets.map(b => b.name).join(', ') + '\n\n' +
          'Please create the "avatars" bucket:\n' +
          '1. Go to Supabase Dashboard → Storage → Buckets\n' +
          '2. Click "New bucket"\n' +
          '3. Name: avatars (exactly, lowercase)\n' +
          '4. Toggle "Public bucket" ON\n' +
          '5. Click "Create bucket"'
        )
        setUploading(false)
        return
      }

      if (avatarsBucket) {
        console.log('Avatars bucket found:', avatarsBucket)
      } else {
        console.log('Avatars bucket not found in list, but attempting upload anyway (might be permission issue)')
      }

      // Create a unique file name - upload directly to bucket root
      const fileExt = file.name.split('.').pop()
      const fileName = `${clerkUser.id}-${Date.now()}.${fileExt}`
      // Upload directly to bucket, not in a subfolder
      const filePath = fileName

      console.log('Uploading file:', { fileName, filePath, fileSize: file.size, fileType: file.type })

      // Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      console.log('Upload result:', { uploadData, uploadError })

      if (uploadError) {
        console.error('Upload error details:', {
          message: uploadError.message,
          error: uploadError
        })
        
        // Provide more specific error messages
        if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('not found')) {
          setError(
            'Storage bucket "avatars" not found. Please create it in Supabase Dashboard → Storage → Buckets'
          )
        } else if (
          uploadError.message.includes('new row violates row-level security') || 
          uploadError.message.includes('permission') ||
          uploadError.message.includes('Row Level Security') ||
          uploadError.message.includes('RLS') ||
          uploadError.message.includes('403') ||
          uploadError.message.includes('401')
        ) {
          setError(
            'Permission denied (Error: ' + uploadError.message + ')\n\n' +
            'Quick Fix:\n' +
            '1. Open Supabase SQL Editor\n' +
            '2. Copy the SQL from STORAGE_POLICY_SIMPLE.sql file\n' +
            '3. Run it (this creates simple, permissive policies)\n\n' +
            'Or check:\n' +
            '- Are you logged in? (check sidebar for your profile)\n' +
            '- Is the bucket set to Public?\n' +
            '- Do storage policies exist?'
          )
        } else if (uploadError.message.includes('already exists')) {
          // Try with a different filename
          const retryFileName = `${clerkUser.id}-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
          const { error: retryError } = await supabase.storage
            .from('avatars')
            .upload(retryFileName, file, {
              cacheControl: '3600',
              upsert: false
            })
          
          if (retryError) {
            setError(`Upload failed: ${retryError.message}`)
          } else {
            const { data: { publicUrl } } = supabase.storage
              .from('avatars')
              .getPublicUrl(retryFileName)
            console.log('Avatar uploaded (retry), public URL:', publicUrl)
            setAvatarUrl(publicUrl)
            setSuccess('Profile picture uploaded successfully!')
            
            // Auto-save the avatar URL immediately after upload
            try {
              if (clerkUser && clerkSession) {
                const token = await clerkSession.getToken({ template: 'supabase' })
                if (token) {
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
                  const result = await response.json()
                  if (response.ok && onUpdate) {
                    setTimeout(() => onUpdate(), 300)
                  }
                }
              }
            } catch (err) {
              console.warn('Error auto-saving avatar:', err)
            }
            
            setUploading(false)
            return
          }
        } else {
          setError(`Upload failed: ${uploadError.message}`)
        }
        setUploading(false)
        return
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      console.log('Avatar uploaded, public URL:', publicUrl)
      setAvatarUrl(publicUrl)
      setSuccess('Profile picture uploaded successfully!')
      
      // Auto-save the avatar URL immediately after upload
      try {
        if (clerkUser && clerkSession) {
          console.log('💾 Attempting to save avatar URL to profiles table:', publicUrl)
          
          const token = await clerkSession.getToken({ template: 'supabase' })
          if (token) {
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

            const result = await response.json()
            
            console.log('📡 Profile API response:', {
              status: response.status,
              ok: response.ok,
              result
            })
            
            if (!response.ok) {
              console.error('❌ Could not auto-save avatar to profiles table:', result)
              setError(`Failed to save profile picture: ${result.error || 'Unknown error'}. Please try clicking "Save Changes" manually.`)
            } else {
              console.log('✅ Avatar URL auto-saved to profiles table:', result)
              
              // Trigger update callback to refresh sidebar
              if (onUpdate) {
                setTimeout(() => {
                  onUpdate()
                }, 1000)
              }
            }
          } else {
            console.warn('Could not get Clerk token for auto-save')
          }
        }
      } catch (err) {
        console.warn('Error auto-saving avatar:', err)
      }
      
      setUploading(false)
    } catch (err: any) {
      setError(err.message || 'Failed to upload image')
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (!clerkUser || !supabase) {
        setError('You must be logged in to update your profile')
        setIsLoading(false)
        return
      }

      // Update profiles table (Clerk doesn't use Supabase user_metadata)
      const profileUpdates: {
        id: string
        username?: string
        avatar_url?: string
        updated_at: string
      } = {
        id: clerkUser.id,
        updated_at: new Date().toISOString()
      }
      
      if (username !== currentUsername) {
        profileUpdates.username = username
      }
      
      if (avatarUrl && avatarUrl !== currentAvatarUrl) {
        profileUpdates.avatar_url = avatarUrl
        console.log('💾 Saving avatar URL in handleSave:', avatarUrl)
      }

      console.log('💾 Updating profile with:', profileUpdates)
      console.log('🔑 Clerk User ID:', clerkUser.id)
      
      // Get Clerk JWT token to send with the request
      if (!clerkSession) {
        setError('You must be logged in to update your profile')
        setIsLoading(false)
        return
      }

      const token = await clerkSession.getToken({ template: 'supabase' })
      if (!token) {
        setError('Failed to get authentication token. Please try signing in again.')
        setIsLoading(false)
        return
      }

      // Use API route instead of direct Supabase client to ensure JWT is sent correctly
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: username || null,
          avatar_url: avatarUrl || null
        })
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('❌ Failed to save profile:', result)
        setError(`Failed to save: ${result.error || 'Unknown error'}. ${result.hint ? `Hint: ${result.hint}` : ''}`)
        setIsLoading(false)
        return
      }

      console.log('✅ Profile updated successfully')
      
      // Note: Username is stored in Supabase profiles table, which is the source of truth
      // Clerk metadata update removed as it's not needed and causes TypeScript errors

      setSuccess('Profile updated successfully!')
      
      // Call onUpdate callback to refresh parent component
      if (onUpdate) {
        setTimeout(() => {
          onUpdate()
        }, 500)
      }

      setIsLoading(false)
      
      // Close modal after successful save
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Failed to update profile')
      setIsLoading(false)
    }
  }

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  const tabs = [
    { id: 'general' as SettingsTab, label: 'General', icon: SettingsIcon },
    { id: 'profile' as SettingsTab, label: 'Profile', icon: UserCircle },
    { id: 'notifications' as SettingsTab, label: 'Notifications', icon: Bell },
    { id: 'security' as SettingsTab, label: 'Security', icon: Shield },
  ]

  if (!mounted) return null

  const modalContent = (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key="settings-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] max-h-[90vh] flex overflow-hidden"
        >
          {/* Left Sidebar Navigation */}
          <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-black">Settings</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex-1 overflow-y-auto p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                      isActive
                        ? 'bg-gray-200 text-black font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-8">

              {/* Tab Content */}
              {activeTab === 'profile' && (
                <>
                  <h3 className="text-2xl font-bold text-black mb-8">Profile</h3>
                  
                  {/* Profile Picture Section */}
                  <div className="mb-8">
                    <label className="block text-base font-medium text-gray-700 mb-4">
                      Picture
                    </label>
                    <div className="flex items-start gap-6">
                      <div className="relative flex-shrink-0">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt="Profile"
                            className="w-32 h-32 rounded-full object-cover border-2 border-gray-200 shadow-sm"
                          />
                        ) : (
                          <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-200 shadow-sm">
                            <User className="w-16 h-16 text-gray-400" />
                          </div>
                        )}
                        {uploading && (
                          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 pt-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base font-medium text-gray-700 mb-3"
                        >
                          <Upload className="w-5 h-5" />
                          {uploading ? 'Uploading...' : 'Upload Image'}
                        </button>
                        <p className="text-sm text-gray-500">
                          JPG, PNG or GIF. Max size 5MB
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Username Section */}
                  <div>
                    <label className="block text-base font-medium text-gray-700 mb-4">
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      className="w-full px-5 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent text-black placeholder:text-gray-400"
                    />
                  </div>
                </>
              )}

              {activeTab === 'general' && (
                <>
                  <h3 className="text-2xl font-bold text-black mb-8">General</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-base font-medium text-gray-700 mb-3">
                        Appearance
                      </label>
                      <select className="w-full px-5 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white">
                        <option>System</option>
                        <option>Light</option>
                        <option>Dark</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-base font-medium text-gray-700 mb-3">
                        Language
                      </label>
                      <select className="w-full px-5 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white">
                        <option>Auto-detect</option>
                        <option>English</option>
                        <option>Spanish</option>
                        <option>French</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'notifications' && (
                <>
                  <h3 className="text-2xl font-bold text-black mb-8">Notifications</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-medium text-black">Email Notifications</p>
                        <p className="text-sm text-gray-500">Receive email updates</p>
                      </div>
                      <input type="checkbox" className="w-5 h-5" defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-medium text-black">Push Notifications</p>
                        <p className="text-sm text-gray-500">Receive push notifications</p>
                      </div>
                      <input type="checkbox" className="w-5 h-5" />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'security' && (
                <>
                  <h3 className="text-2xl font-bold text-black mb-8">Security</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-base font-medium text-gray-700 mb-3">
                        Two-Factor Authentication
                      </label>
                      <button className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium">
                        Enable 2FA
                      </button>
                    </div>
                    <div>
                      <label className="block text-base font-medium text-gray-700 mb-3">
                        Change Password
                      </label>
                      <button className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700">
                        Update Password
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Error/Success Messages */}
              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              {success && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-600">{success}</p>
                </div>
              )}

              {/* Save Button (only show on profile tab) */}
              {activeTab === 'profile' && (
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <button
                    onClick={handleSave}
                    disabled={isLoading || uploading}
                    className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {isLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(modalContent, document.body)
}

