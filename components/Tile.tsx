'use client'

import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useScroll } from '@react-three/drei'
import * as THREE from 'three'

interface TileProps {
  position: [number, number, number]
  imageUrl?: string
  index: number
}

export default function Tile({ position, imageUrl, index }: TileProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const scroll = useScroll()
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  
  // Load texture - fallback to a gradient if no image
  useEffect(() => {
    if (imageUrl) {
      try {
        const loader = new THREE.TextureLoader()
        loader.load(
          imageUrl,
          (loadedTexture) => {
            setTexture(loadedTexture)
          },
          undefined,
          () => {
            // On error, use gradient
            setTexture(createGradientTexture())
          }
        )
      } catch {
        setTexture(createGradientTexture())
      }
    } else {
      setTexture(createGradientTexture())
    }
  }, [imageUrl])

  // Animate tile based on scroll position
  useFrame(() => {
    if (!meshRef.current) return
    
    const offset = scroll.offset
    const tileOffset = (offset * 0.5) + (index * 0.1)
    
    // Parallax effect - tiles move at different speeds
    meshRef.current.position.z = position[2] + tileOffset * 2
    
    // Opacity based on scroll and position
    const opacity = Math.max(0, Math.min(1, 1 - (tileOffset * 0.5)))
    if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
      meshRef.current.material.opacity = opacity
    }
    
    // Subtle rotation for depth
    meshRef.current.rotation.y = Math.sin(tileOffset) * 0.1
    meshRef.current.rotation.x = Math.cos(tileOffset) * 0.05
  })

  return (
    <mesh
      ref={meshRef}
      position={position}
      scale={[2, 2, 1]}
    >
      <planeGeometry args={[1, 1, 32, 32]} />
      <meshStandardMaterial
        map={texture || createGradientTexture()}
        transparent
        opacity={0.9}
        roughness={0.3}
        metalness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

// Helper function to create a gradient texture
function createGradientTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  
  const gradient = ctx.createLinearGradient(0, 0, 512, 512)
  gradient.addColorStop(0, '#667eea')
  gradient.addColorStop(1, '#764ba2')
  
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 512)
  
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

