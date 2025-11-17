'use client'

import { useThree, useFrame } from '@react-three/fiber'
import { useScroll } from '@react-three/drei'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'

export default function CameraController() {
  const { camera } = useThree()
  const scroll = useScroll()
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)

  // Update camera position based on scroll
  useFrame(() => {
    if (!cameraRef.current) return
    
    const offset = scroll.offset
    
    // Camera zoom based on scroll (0 to 1)
    const zoom = 5 + offset * 10 // Zoom from 5 to 15
    const yOffset = offset * 2 // Vertical parallax
    
    // Smooth camera movement
    cameraRef.current.position.z = THREE.MathUtils.lerp(
      cameraRef.current.position.z,
      zoom,
      0.1
    )
    
    cameraRef.current.position.y = THREE.MathUtils.lerp(
      cameraRef.current.position.y,
      yOffset,
      0.1
    )
    
    // Rotate camera slightly based on scroll for dynamic feel
    cameraRef.current.rotation.x = THREE.MathUtils.lerp(
      cameraRef.current.rotation.x,
      offset * 0.2,
      0.05
    )
  })


  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      cameraRef.current = camera
      camera.position.set(0, 0, 5)
      camera.lookAt(0, 0, 0)
    }
  }, [camera])

  return null
}

