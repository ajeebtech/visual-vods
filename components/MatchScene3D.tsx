'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import * as THREE from 'three'

interface VODLink {
  url: string
  platform: 'youtube' | 'twitch' | 'other'
  embedUrl?: string
}

interface Match {
  href: string
  matchId?: string
  vodLinks: VODLink[]
  hasVODs: boolean
}

interface MatchScene3DProps {
  matches: Match[]
}

// Helper to get YouTube thumbnail from video ID or URL
const getYouTubeThumbnail = (url: string): string | null => {
  let videoId: string | null = null
  
  if (url.includes('youtu.be/')) {
    const match = url.match(/youtu\.be\/([^?&]+)/)
    videoId = match ? match[1] : null
  } else if (url.includes('youtube.com/watch')) {
    const match = url.match(/[?&]v=([^&]+)/)
    videoId = match ? match[1] : null
  } else if (url.includes('youtube.com/embed/')) {
    const match = url.match(/embed\/([^?&]+)/)
    videoId = match ? match[1] : null
  }
  
  if (videoId) {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  }
  
  return null
}

// Generate scattered positions with older matches further back
function generateMatchPositions(count: number): Array<[number, number, number]> {
  const positions: Array<[number, number, number]> = []
  const spread = 15 // How far to spread on x and y axes
  
  for (let i = 0; i < count; i++) {
    // Scatter randomly on x and y
    const x = (Math.random() - 0.5) * spread * 2
    const y = (Math.random() - 0.5) * spread * 2
    
    // Calculate z-depth: matches 20+ are further back
    let z: number
    if (i < 20) {
      // First 20 matches: closer to camera (0 to -5)
      z = -Math.random() * 5
    } else {
      // Matches 20+: further back (-5 to -20, with older ones further)
      const age = i - 20
      const maxDepth = -5 - (age * 0.5) // Each older match goes further back
      z = -5 - Math.random() * Math.min(15, maxDepth + 5)
    }
    
    positions.push([x, y, z])
  }
  
  return positions
}

// 3D Match Tile Component
function MatchTile({
  position,
  thumbnail,
  match,
  onSelect,
  index,
}: {
  position: [number, number, number]
  thumbnail: string | null
  match: Match
  onSelect: () => void
  index: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  
  // Load texture
  useEffect(() => {
    let currentTexture: THREE.Texture | null = null
    
    if (thumbnail) {
      const loader = new THREE.TextureLoader()
      loader.load(
        thumbnail,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          currentTexture = tex
          setTexture(tex)
        },
        undefined,
        (error) => {
          console.error(`Error loading thumbnail for match ${match.matchId}:`, error)
          setTexture(null)
        }
      )
    } else {
      setTexture(null)
    }
    
    return () => {
      if (currentTexture) {
        currentTexture.dispose()
      }
    }
  }, [thumbnail, match.matchId])
  
  // Purple gradient color
  const purpleColor = new THREE.Color(0x9333ea)
  
  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[0, 0, 0]} // Face camera (top-down view)
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onClick={onSelect}
      scale={hovered ? 1.15 : 1}
    >
      <planeGeometry args={[2, 1.125]} />
      {texture ? (
        <meshStandardMaterial 
          map={texture} 
          side={THREE.DoubleSide}
          transparent={false}
          opacity={1}
        />
      ) : (
        <meshStandardMaterial 
          color={purpleColor} 
          side={THREE.DoubleSide}
          transparent={false}
          opacity={1}
        />
      )}
    </mesh>
  )
}

export default function MatchScene3D({ matches }: MatchScene3DProps) {
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [selectedVOD, setSelectedVOD] = useState<VODLink | null>(null)
  
  // Filter only YouTube VODs with embed URLs
  const youtubeMatches = useMemo(() => {
    return matches
      .map(match => ({
        ...match,
        vodLinks: match.vodLinks.filter(
          vod => vod.platform === 'youtube' && vod.embedUrl
        )
      }))
      .filter(m => m.vodLinks.length > 0)
  }, [matches])
  
  // Generate positions for all matches
  const positions = useMemo(
    () => generateMatchPositions(youtubeMatches.length),
    [youtubeMatches.length]
  )
  
  const handleThumbnailClick = (match: Match) => {
    if (match.vodLinks.length > 0) {
      setSelectedMatch(match)
      setSelectedVOD(match.vodLinks[0])
    }
  }
  
  const closeEmbed = () => {
    setSelectedMatch(null)
    setSelectedVOD(null)
  }
  
  return (
    <>
      <div className="fixed inset-0 z-30">
        <Canvas
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
          className="bg-gray-100"
        >
          <PerspectiveCamera
            makeDefault
            position={[0, 0, 15]}
            fov={75}
          />
          
          {/* Lighting */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={0.8} />
          <pointLight position={[-10, -10, -5]} intensity={0.4} />
          
          {/* Camera controls - only zoom, no rotation */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={false} // Disable rotation
            panSpeed={1.5} // Faster panning
            zoomSpeed={1.2}
            minDistance={5}
            maxDistance={80} // Increased max distance to see further back matches
            minPolarAngle={Math.PI / 2} // Lock to top-down view
            maxPolarAngle={Math.PI / 2}
            minAzimuthAngle={-Infinity} // Allow full horizontal panning
            maxAzimuthAngle={Infinity}
            screenSpacePanning={true} // Pan in screen space (easier to move up/down/left/right)
            mouseButtons={{
              LEFT: THREE.MOUSE.PAN, // Left click to pan
              MIDDLE: THREE.MOUSE.DOLLY, // Middle mouse to zoom
              RIGHT: THREE.MOUSE.PAN // Right click also pans
            }}
            touches={{
              ONE: THREE.TOUCH.PAN, // One finger to pan
              TWO: THREE.TOUCH.DOLLY_PAN // Two fingers to zoom and pan
            }}
          />
          
          {/* Match tiles */}
          {youtubeMatches.map((match, index) => {
            const firstVOD = match.vodLinks[0]
            const thumbnail = getYouTubeThumbnail(firstVOD.url)
            
            // Debug logging
            if (index < 3) {
              console.log(`Match ${index}:`, {
                matchId: match.matchId,
                thumbnail,
                vodUrl: firstVOD.url,
                position: positions[index]
              })
            }
            
            return (
              <MatchTile
                key={match.matchId || index}
                position={positions[index]}
                thumbnail={thumbnail}
                match={match}
                onSelect={() => handleThumbnailClick(match)}
                index={index}
              />
            )
          })}
        </Canvas>
      </div>
      
      {/* Info overlay */}
      <div className="fixed top-4 left-24 z-40 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
        <p className="text-sm font-medium text-gray-900">
          {youtubeMatches.length} YouTube VODs • Zoom to explore layers
        </p>
        <p className="text-xs text-gray-600 mt-1">
          First 20 matches closer • Older matches further back
        </p>
      </div>
      
      {/* Embed Modal */}
      <AnimatePresence>
        {selectedMatch && selectedVOD && selectedVOD.embedUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
            onClick={closeEmbed}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-6xl aspect-video bg-black rounded-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={closeEmbed}
                className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
              
              {/* Embed iframe */}
              <iframe
                src={selectedVOD.embedUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={`Match ${selectedMatch.matchId} VOD`}
              />
              
              {/* VOD selector if multiple VODs */}
              {selectedMatch.vodLinks.length > 1 && (
                <div className="absolute bottom-4 left-4 right-4 flex gap-2 overflow-x-auto">
                  {selectedMatch.vodLinks.map((vod, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedVOD(vod)}
                      className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${
                        selectedVOD === vod
                          ? 'bg-purple-600 text-white'
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      YouTube {index + 1}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

