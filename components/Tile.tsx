'use client'

import { useRef, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface TileProps {
  position: [number, number, number]
  imageUrl?: string
  index: number
  onSelect?: () => void
  isSelected?: boolean
}

export default function Tile({ position, imageUrl, index, onSelect, isSelected }: TileProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const [hovered, setHovered] = useState(false)
  const { raycaster, pointer, camera } = useThree()

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

  // Animate tile - hover and selection effects (instant, no spring)
  useFrame(() => {
    if (!meshRef.current) return

    const targetScale = isSelected ? 2.5 : hovered ? 1.3 : 1
    meshRef.current.scale.set(targetScale, targetScale, 1)

    // Highlight effect when selected or hovered
    if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
      const targetEmissive = isSelected ? 0.3 : hovered ? 0.15 : 0
      meshRef.current.material.emissive.set(targetEmissive, targetEmissive, targetEmissive)
    }
  })

  const handleClick = (e: THREE.Event) => {
    e.stopPropagation()
    if (onSelect) {
      onSelect()
    }
  }

  const handlePointerOver = (e: THREE.Event) => {
    e.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }

  const handlePointerOut = () => {
    setHovered(false)
    document.body.style.cursor = 'auto'
  }

  return (
    <mesh
      ref={meshRef}
      position={position}
      scale={[1, 1, 1]}
      rotation={[0, 0, 0]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <planeGeometry args={[1.2, 1.6, 32, 32]} />
      <meshStandardMaterial
        map={texture || createGradientTexture()}
        transparent
        opacity={0.95}
        roughness={0.2}
        metalness={0.1}
        side={THREE.DoubleSide}
        emissive={new THREE.Color(0, 0, 0)}
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

