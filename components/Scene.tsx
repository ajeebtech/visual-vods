'use client'

import { Canvas } from '@react-three/fiber'
import { ScrollControls, Environment } from '@react-three/drei'
import { EffectComposer, DepthOfField, Bloom, Vignette } from '@react-three/postprocessing'
import { Suspense } from 'react'
import CameraController from './CameraController'
import Tile from './Tile'

export default function Scene() {
  return (
    <div className="w-full h-full">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        className="bg-black"
      >
        <Suspense fallback={null}>
          <ScrollControls
            pages={3}
            distance={1}
            damping={0.25}
          >
            {/* Lighting */}
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <pointLight position={[-10, -10, -5]} intensity={0.5} />
            
            {/* Environment for reflections */}
            <Environment preset="city" />
            
            {/* Camera Controller - handles scroll-driven camera movement */}
            <CameraController />
            
            {/* 3D Tiles */}
            <Tile 
              position={[0, 0, 0]} 
              imageUrl="/textures/sample1.jpg"
              index={0}
            />
            <Tile 
              position={[3, 0, -2]} 
              imageUrl="/textures/sample2.jpg"
              index={1}
            />
            <Tile 
              position={[-3, 0, -2]} 
              imageUrl="/textures/sample3.jpg"
              index={2}
            />
            <Tile 
              position={[0, 3, -4]} 
              imageUrl="/textures/sample4.jpg"
              index={3}
            />
            <Tile 
              position={[0, -3, -4]} 
              imageUrl="/textures/sample5.jpg"
              index={4}
            />
          </ScrollControls>
          
          {/* Post-processing effects */}
          <EffectComposer>
            <DepthOfField 
              focusDistance={0.1} 
              focalLength={0.02} 
              bokehScale={2} 
              height={480} 
            />
            <Bloom 
              intensity={0.5} 
              luminanceThreshold={0.9} 
              luminanceSmoothing={0.9} 
            />
            <Vignette eskil={false} offset={0.1} darkness={0.5} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  )
}

