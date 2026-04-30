import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../public/icons')
fs.mkdirSync(outDir, { recursive: true })

// MJ icon — dark background, serif MJ text
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="#0a0a0a"/>
  <text
    x="${size / 2}"
    y="${size * 0.67}"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="${Math.round(size * 0.44)}"
    font-weight="700"
    fill="white"
    text-anchor="middle"
    dominant-baseline="auto"
    letter-spacing="-2"
  >MJ</text>
</svg>`

const sizes = [192, 512]

for (const size of sizes) {
  await sharp(Buffer.from(svg(size))).png().toFile(path.join(outDir, `icon-${size}.png`))
  console.log(`✓ icon-${size}.png`)
}

// Apple touch icon (180×180, no rounded corners — iOS clips it)
const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="#0a0a0a"/>
  <text x="90" y="120" font-family="Georgia, 'Times New Roman', serif" font-size="80" font-weight="700" fill="white" text-anchor="middle">MJ</text>
</svg>`
await sharp(Buffer.from(appleSvg)).png().toFile(path.join(outDir, 'apple-touch-icon.png'))
console.log('✓ apple-touch-icon.png')
