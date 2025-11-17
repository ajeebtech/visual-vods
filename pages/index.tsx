import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'

// Dynamically import Scene to avoid SSR issues with Three.js
const Scene = dynamic(() => import('../components/Scene'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
      <div className="text-xl">Loading 3D Scene...</div>
    </div>
  ),
})

export default function Home() {
  return (
    <>
      <Head>
        <title>Soot Gimmick - 3D Interactive UI</title>
        <meta name="description" content="3D interactive UI built with React Three Fiber" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="relative w-full h-screen overflow-hidden">
        <Suspense fallback={
          <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
            <div className="text-xl">Loading...</div>
          </div>
        }>
          <Scene />
        </Suspense>
      </main>
    </>
  )
}

