# Quick Start Guide

## 🚀 Getting Started

1. **Install dependencies**:
```bash
npm install
```

2. **Start the development server**:
```bash
npm run dev
```

3. **Open your browser**:
Navigate to [http://localhost:3000](http://localhost:3000)

## 📝 What You'll See

- A black canvas with 3D gradient planes (since no images are loaded yet)
- Scroll to see camera zoom and parallax effects
- Smooth animations and post-processing effects

## 🖼️ Adding Your Own Images

1. Add images to `public/textures/` directory
2. Update `components/Scene.tsx` to reference your images:

```tsx
<Tile 
  position={[0, 0, 0]} 
  imageUrl="/textures/your-image.jpg"
  index={0}
/>
```

## 🎮 Controls

- **Scroll**: Zoom camera and move through 3D space
- **Mouse**: Interact with the scene (if gesture controls are enabled)

## 🛠️ Troubleshooting

### Images not loading?
- Make sure images are in `public/textures/` directory
- Check that image paths start with `/textures/`
- The app will show gradient fallbacks if images fail to load

### Performance issues?
- Reduce the number of tiles in `Scene.tsx`
- Lower the `dpr` value in the Canvas component
- Disable post-processing effects temporarily

### Scroll not working?
- Make sure you're using a modern browser
- Check browser console for errors
- Try refreshing the page

## 📚 Next Steps

- Add more tiles with different positions
- Experiment with camera settings in `CameraController.tsx`
- Adjust post-processing effects in `Scene.tsx`
- Add interactive hover effects to tiles
- Load GLTF 3D models instead of images

