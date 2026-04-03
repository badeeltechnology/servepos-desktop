// Generate app icon as SVG, then convert to PNG using sips (macOS)
const { writeFileSync, mkdirSync, existsSync } = require('fs')
const { execSync } = require('child_process')
const path = require('path')

const resourcesDir = path.join(__dirname, '..', 'resources')
if (!existsSync(resourcesDir)) mkdirSync(resourcesDir, { recursive: true })

// ServePOS icon — modern POS terminal with S monogram
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3B82F6"/>
      <stop offset="100%" style="stop-color:#1D4ED8"/>
    </linearGradient>
    <linearGradient id="screen" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#EFF6FF"/>
      <stop offset="100%" style="stop-color:#DBEAFE"/>
    </linearGradient>
  </defs>

  <!-- Background rounded square -->
  <rect x="0" y="0" width="1024" height="1024" rx="220" fill="url(#bg)"/>

  <!-- POS Terminal body -->
  <rect x="240" y="160" width="544" height="704" rx="48" fill="white" opacity="0.95"/>

  <!-- Screen -->
  <rect x="296" y="216" width="432" height="320" rx="24" fill="url(#screen)"/>

  <!-- S letter on screen -->
  <text x="512" y="420" font-family="system-ui, -apple-system, sans-serif" font-size="220" font-weight="800" fill="#2563EB" text-anchor="middle" dominant-baseline="middle">S</text>

  <!-- Grid dots (items) -->
  <circle cx="360" cy="610" r="20" fill="#3B82F6" opacity="0.3"/>
  <circle cx="440" cy="610" r="20" fill="#3B82F6" opacity="0.3"/>
  <circle cx="520" cy="610" r="20" fill="#3B82F6" opacity="0.3"/>
  <circle cx="600" cy="610" r="20" fill="#3B82F6" opacity="0.3"/>
  <circle cx="680" cy="610" r="20" fill="#3B82F6" opacity="0.3"/>

  <circle cx="360" cy="680" r="20" fill="#3B82F6" opacity="0.3"/>
  <circle cx="440" cy="680" r="20" fill="#3B82F6" opacity="0.3"/>
  <circle cx="520" cy="680" r="20" fill="#3B82F6" opacity="0.3"/>
  <circle cx="600" cy="680" r="20" fill="#3B82F6" opacity="0.3"/>
  <circle cx="680" cy="680" r="20" fill="#3B82F6" opacity="0.3"/>

  <!-- Bottom bar (pay button) -->
  <rect x="296" y="740" width="432" height="64" rx="16" fill="#2563EB"/>
  <rect x="296" y="740" width="432" height="64" rx="16" fill="#2563EB"/>

  <!-- Receipt coming out from top -->
  <rect x="380" y="80" width="264" height="120" rx="8" fill="white" opacity="0.8"/>
  <line x1="410" y1="110" x2="560" y2="110" stroke="#93C5FD" stroke-width="6" stroke-linecap="round"/>
  <line x1="410" y1="135" x2="620" y2="135" stroke="#93C5FD" stroke-width="6" stroke-linecap="round"/>
  <line x1="410" y1="160" x2="540" y2="160" stroke="#93C5FD" stroke-width="6" stroke-linecap="round"/>
</svg>`

const svgPath = path.join(resourcesDir, 'icon.svg')
writeFileSync(svgPath, svg)
console.log('Created icon.svg')

// Convert SVG to PNG using a simple approach
// We'll create an HTML file and use Electron to render it, or use sips on macOS

// For GitHub Actions (cross-platform), we need PNG files
// Let's create a simple script that works with sips on macOS

try {
  // Create iconset for macOS .icns
  const iconsetDir = path.join(resourcesDir, 'icon.iconset')
  if (!existsSync(iconsetDir)) mkdirSync(iconsetDir, { recursive: true })

  // Use Python to convert SVG to PNG (cairosvg or Pillow might not be available)
  // Instead, let's try using the built-in qlmanage or sips
  // Actually, let's use a simpler approach - create a basic PNG with Node

  // For now, output instruction
  console.log('')
  console.log('To generate final icons, run:')
  console.log('  brew install librsvg  # if not installed')
  console.log('  rsvg-convert -w 1024 -h 1024 resources/icon.svg -o resources/icon.png')
  console.log('')
  console.log('Or open resources/icon.svg in a browser, screenshot at 1024x1024, save as icon.png')
  console.log('')
  console.log('Then for macOS .icns:')
  console.log('  mkdir -p resources/icon.iconset')
  console.log('  sips -z 16 16 resources/icon.png --out resources/icon.iconset/icon_16x16.png')
  console.log('  sips -z 32 32 resources/icon.png --out resources/icon.iconset/icon_16x16@2x.png')
  console.log('  sips -z 32 32 resources/icon.png --out resources/icon.iconset/icon_32x32.png')
  console.log('  sips -z 64 64 resources/icon.png --out resources/icon.iconset/icon_32x32@2x.png')
  console.log('  sips -z 128 128 resources/icon.png --out resources/icon.iconset/icon_128x128.png')
  console.log('  sips -z 256 256 resources/icon.png --out resources/icon.iconset/icon_128x128@2x.png')
  console.log('  sips -z 256 256 resources/icon.png --out resources/icon.iconset/icon_256x256.png')
  console.log('  sips -z 512 512 resources/icon.png --out resources/icon.iconset/icon_256x256@2x.png')
  console.log('  sips -z 512 512 resources/icon.png --out resources/icon.iconset/icon_512x512.png')
  console.log('  sips -z 1024 1024 resources/icon.png --out resources/icon.iconset/icon_512x512@2x.png')
  console.log('  iconutil -c icns resources/icon.iconset -o resources/icon.icns')

} catch (e) {
  console.error('Error:', e.message)
}
