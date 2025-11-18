'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { EffectComposer, DepthOfField, Bloom, Vignette } from '@react-three/postprocessing'
import { Suspense, useState, useMemo } from 'react'
import CameraController from './CameraController'
import Tile from './Tile'
import * as THREE from 'three'

// Generate positions for tiles without overlap
function generateCloudPositions(count: number): Array<[number, number, number]> {
  const positions: Array<[number, number, number]> = []
  const minDistance = 2.5 // Minimum distance between tiles to prevent overlap
  const maxAttempts = 100

  for (let i = 0; i < count; i++) {
    let attempts = 0
    let validPosition = false
    let x = 0, y = 0, z = 0

    // Try to find a position that doesn't overlap with existing tiles
    while (!validPosition && attempts < maxAttempts) {
      // Generate random position in a spherical volume
      const radius = 8
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = radius * (0.3 + Math.random() * 0.7)

      x = r * Math.sin(phi) * Math.cos(theta)
      y = r * Math.sin(phi) * Math.sin(theta)
      z = r * Math.cos(phi)

      // Check if this position is far enough from all existing positions
      validPosition = true
      for (const [px, py, pz] of positions) {
        const distance = Math.sqrt(
          Math.pow(x - px, 2) +
          Math.pow(y - py, 2) +
          Math.pow(z - pz, 2)
        )
        if (distance < minDistance) {
          validPosition = false
          break
        }
      }

      attempts++
    }

    // If we couldn't find a valid position after max attempts, use the last generated one
    // This might cause slight overlap but prevents infinite loops
    positions.push([x, y, z])
  }

  return positions
}

export default function Scene() {
  const [selectedTile, setSelectedTile] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)

  // Generate many tiles in a cloud pattern
  const tilePositions = useMemo(() => generateCloudPositions(50), [])

  // Available image paths - you can add more
  const imagePaths = [
    '/textures/sample1.jpg',
    '/textures/sample2.jpg',
    '/textures/sample3.jpg',
    '/textures/sample4.jpg',
    '/textures/sample5.jpg',
  ]

  return (
    <div className="w-full h-full">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        className="bg-gray-100"
        camera={{ position: [0, 0, 15], fov: 60 }}
      >
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={0.8} />
          <pointLight position={[-10, -10, -5]} intensity={0.4} />

          {/* Environment for reflections */}
          <Environment preset="city" />

          {/* Mouse-controlled camera - zoom always enabled, pan/rotate disabled only during animation */}
          <OrbitControls
            enablePan={!isAnimating}
            enableZoom={true}
            enableRotate={!isAnimating}
            minDistance={2}
            maxDistance={30}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2}
            dampingFactor={0}
            enableDamping={false}
          />

          {/* Camera Controller - handles zoom to selected tile */}
          <CameraController
            selectedTile={selectedTile}
            tilePositions={tilePositions}
            onAnimationChange={setIsAnimating}
          />

          {/* 3D Tiles - arranged in cloud-like pattern */}
          {tilePositions.map((position, index) => (
            <Tile
              key={index}
              position={position}
              imageUrl={imagePaths[index % imagePaths.length]}
              index={index}
              onSelect={() => setSelectedTile(selectedTile === index ? null : index)}
              isSelected={selectedTile === index}
            />
          ))}

          {/* Post-processing effects */}
          <EffectComposer>
            <DepthOfField
              focusDistance={0.1}
              focalLength={0.02}
              bokehScale={2}
              height={480}
            />
            <Bloom
              intensity={0.3}
              luminanceThreshold={0.9}
              luminanceSmoothing={0.9}
            />
            <Vignette eskil={false} offset={0.1} darkness={0.3} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  )
}

