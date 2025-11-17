# Soot Gimmick - 3D Interactive UI

A modern WebGL + React implementation inspired by Soot.com's 3D interactive UI, built with React Three Fiber, Framer Motion, and Next.js.

## 🚀 Features

- **WebGL Rendering**: Powered by Three.js and React Three Fiber
- **Scroll-Driven 3D**: Smooth camera zoom, parallax layers, and opacity transitions
- **Post-Processing Effects**: Depth of field, bloom, and vignette
- **Smooth Animations**: Framer Motion and react-spring for fluid interactions
- **Modern Stack**: Next.js 14, React 18, TypeScript, Tailwind CSS

## 📦 Installation

1. **Install dependencies**:
```bash
npm install
```

2. **Run the development server**:
```bash
npm run dev
```

3. **Open** [http://localhost:3000](http://localhost:3000) in your browser

## 🏗️ Project Structure

```
soot-gimmick/
├── pages/
│   ├── _app.tsx          # Next.js app wrapper
│   └── index.tsx         # Main page
├── components/
│   ├── Scene.tsx         # Main 3D scene setup
│   ├── CameraController.tsx  # Scroll-driven camera controls
│   └── Tile.tsx          # 3D plane component for images
├── public/
│   └── textures/         # Place your images here
├── styles/
│   └── globals.css       # Global styles
└── package.json
```

## 🎨 Customization

### Adding Your Own Images

1. Place your images in the `public/textures/` directory
2. Update the `Tile` components in `components/Scene.tsx` with your image paths:

```tsx
<Tile 
  position={[0, 0, 0]} 
  imageUrl="/textures/your-image.jpg"
  index={0}
/>
```

### Adjusting Camera Behavior

Edit `components/CameraController.tsx` to modify:
- Camera zoom range
- Parallax intensity
- Rotation sensitivity

### Post-Processing Effects

Modify effects in `components/Scene.tsx`:
- `DepthOfField`: Focus distance and bokeh
- `Bloom`: Intensity and luminance
- `Vignette`: Darkness and offset

## 🛠️ Tech Stack

| Layer | Tool |
|-------|------|
| Framework | Next.js 14 |
| UI | React 18 + TypeScript |
| 3D | React Three Fiber + Drei |
| Animation | Framer Motion |
| Scroll Sync | @react-three/drei useScroll |
| Post-Processing | @react-three/postprocessing |
| Styling | Tailwind CSS |

## 📚 Key Dependencies

- `three` - WebGL library
- `@react-three/fiber` - React renderer for Three.js
- `@react-three/drei` - Useful helpers for R3F
- `@react-three/postprocessing` - Post-processing effects
- `framer-motion` - Animation library
- `@use-gesture/react` - Gesture controls

## 🎯 Next Steps

1. **Add more tiles**: Create additional `Tile` components with different positions
2. **Load GLTF models**: Use `@react-three/drei`'s `useGLTF` hook
3. **Add interactions**: Implement hover effects and click handlers
4. **Optimize performance**: Use `React.memo` and `useMemo` for expensive calculations
5. **Add content**: Create scrollable sections with text overlays

## 🚢 Deployment

Deploy to Vercel:

```bash
npm run build
vercel
```

Or use any Node.js hosting platform that supports Next.js.

## 📝 License

MIT

## 🙏 Credits

Inspired by [Soot.com](https://soot.com)'s innovative 3D interactive UI.

