'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

interface MatchInfo {
  team1: {
    name: string
    logo: string | null
  }
  team2: {
    name: string
    logo: string | null
  }
  score: {
    team1: number
    team2: number
  }
  winner: 1 | 2 | null
}

interface MatchInfoOverlayProps {
  matchInfo: MatchInfo
  position: [number, number, number]
}

export default function MatchInfoOverlay({ matchInfo, position }: MatchInfoOverlayProps) {
  const groupRef = useRef<THREE.Group>(null)
  const [team1LogoTexture, setTeam1LogoTexture] = useState<THREE.Texture | null>(null)
  const [team2LogoTexture, setTeam2LogoTexture] = useState<THREE.Texture | null>(null)
  
  // Load team logos
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    
    if (matchInfo.team1.logo) {
      loader.load(
        matchInfo.team1.logo,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          setTeam1LogoTexture(tex)
        },
        undefined,
        () => setTeam1LogoTexture(null)
      )
    }
    
    if (matchInfo.team2.logo) {
      loader.load(
        matchInfo.team2.logo,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          setTeam2LogoTexture(tex)
        },
        undefined,
        () => setTeam2LogoTexture(null)
      )
    }
    
    return () => {
      if (team1LogoTexture) team1LogoTexture.dispose()
      if (team2LogoTexture) team2LogoTexture.dispose()
    }
  }, [matchInfo.team1.logo, matchInfo.team2.logo])
  
  // Always face camera
  useFrame(({ camera }) => {
    if (groupRef.current) {
      groupRef.current.lookAt(camera.position)
    }
  })
  
  const winnerColor = new THREE.Color(0x4ade80) // Green for winner
  const loserColor = new THREE.Color(0xffffff) // White for loser
  
  return (
    <group ref={groupRef} position={position}>
      {/* Background plane */}
      <mesh position={[0, -0.7, 0]} rotation={[0, 0, 0]}>
        <planeGeometry args={[2.2, 0.5]} />
        <meshStandardMaterial 
          color={new THREE.Color(0x1a1a1a)} 
          side={THREE.DoubleSide}
          transparent={true}
          opacity={0.95}
        />
      </mesh>
      
      {/* Team 1 logo */}
      {team1LogoTexture && (
        <mesh position={[-0.7, -0.7, 0.01]}>
          <planeGeometry args={[0.15, 0.15]} />
          <meshStandardMaterial map={team1LogoTexture} side={THREE.DoubleSide} transparent={true} />
        </mesh>
      )}
      
      {/* Team 1 score */}
      <mesh position={[-0.4, -0.7, 0.01]}>
        <planeGeometry args={[0.2, 0.2]} />
        <meshStandardMaterial 
          color={matchInfo.winner === 1 ? winnerColor : loserColor}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* VS or colon */}
      <mesh position={[0, -0.7, 0.01]}>
        <planeGeometry args={[0.1, 0.1]} />
        <meshStandardMaterial 
          color={new THREE.Color(0x888888)}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Team 2 score */}
      <mesh position={[0.4, -0.7, 0.01]}>
        <planeGeometry args={[0.2, 0.2]} />
        <meshStandardMaterial 
          color={matchInfo.winner === 2 ? winnerColor : loserColor}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Team 2 logo */}
      {team2LogoTexture && (
        <mesh position={[0.7, -0.7, 0.01]}>
          <planeGeometry args={[0.15, 0.15]} />
          <meshStandardMaterial map={team2LogoTexture} side={THREE.DoubleSide} transparent={true} />
        </mesh>
      )}
    </group>
  )
}

