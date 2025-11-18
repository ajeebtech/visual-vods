'use client'

import { useThree, useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

interface CameraControllerProps {
  selectedTile: number | null
  tilePositions: Array<[number, number, number]>
  onAnimationChange?: (isAnimating: boolean) => void
}

export default function CameraController({ selectedTile, tilePositions, onAnimationChange }: CameraControllerProps) {
  const { camera } = useThree()
  const [targetPosition, setTargetPosition] = useState<THREE.Vector3 | null>(null)
  const [targetLookAt, setTargetLookAt] = useState<THREE.Vector3 | null>(null)
  const isAnimating = useRef(false)

  // Handle zoom to selected tile - set target for smooth animation
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    
    if (selectedTile !== null && tilePositions[selectedTile]) {
      const [x, y, z] = tilePositions[selectedTile]
      // Position camera closer to the tile for zoom effect
      const zoomDistance = 2.5
      const offset = new THREE.Vector3(0, 0, zoomDistance)
      const tilePosition = new THREE.Vector3(x, y, z)
      
      // Set target for smooth animation
      setTargetPosition(tilePosition.clone().add(offset))
      setTargetLookAt(tilePosition)
      isAnimating.current = true
      onAnimationChange?.(true)
    } else {
      // When deselected, stop animation and let OrbitControls take over
      setTargetPosition(null)
      setTargetLookAt(null)
      isAnimating.current = false
    }
  }, [selectedTile, tilePositions, camera])

  // Smooth zoom-in animation when tile is selected
  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    
    // Only animate during the zoom-in animation
    // Once complete, let OrbitControls handle everything (including zoom out)
    if (targetPosition && targetLookAt && isAnimating.current) {
      // Smoothly animate to target position
      camera.position.lerp(targetPosition, 0.1)
      camera.lookAt(targetLookAt)
      
      // Check if we're close enough to stop animating
      const distance = camera.position.distanceTo(targetPosition)
      if (distance < 0.01) {
        camera.position.copy(targetPosition)
        isAnimating.current = false
        onAnimationChange?.(false)
        // Clear targets so we don't interfere with OrbitControls
        setTargetPosition(null)
        setTargetLookAt(null)
      }
    }
    // After animation completes, CameraController does nothing
    // OrbitControls has full control for zoom, pan, rotate
  })

  return null
}

