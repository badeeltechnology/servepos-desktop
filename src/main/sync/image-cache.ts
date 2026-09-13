import { app, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import { getActiveUrl } from './erpnext-client'
import { getConfig } from '../database/queries'

const IMAGE_DIR = join(app.getPath('userData'), 'cached-images')
const MAX_SIZE = 300 // max width/height in pixels

function ensureDir(): void {
  if (!existsSync(IMAGE_DIR)) {
    mkdirSync(IMAGE_DIR, { recursive: true })
  }
}

function sanitizeFilename(itemCode: string): string {
  return itemCode.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function getImageDir(): string {
  return IMAGE_DIR
}

export function getLocalImagePath(itemCode: string): string {
  return join(IMAGE_DIR, `${sanitizeFilename(itemCode)}.png`)
}

export async function downloadAndCacheImage(
  imageUrl: string,
  itemCode: string
): Promise<string | null> {
  try {
    ensureDir()

    // Build full URL if relative
    let fullUrl = imageUrl
    if (imageUrl.startsWith('/')) {
      fullUrl = `${getActiveUrl()}${imageUrl}`
    }

    const apiKey = getConfig('api_key') || ''
    const apiSecret = getConfig('api_secret') || ''

    const res = await fetch(fullUrl, {
      headers: {
        Authorization: `token ${apiKey}:${apiSecret}`
      }
    })

    if (!res.ok) {
      console.warn(`[ImageCache] Failed to download ${fullUrl}: ${res.status}`)
      return null
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    const img = nativeImage.createFromBuffer(buffer)

    if (img.isEmpty()) {
      console.warn(`[ImageCache] Invalid image for ${itemCode}`)
      return null
    }

    // Resize if larger than MAX_SIZE
    const size = img.getSize()
    let resized = img
    if (size.width > MAX_SIZE || size.height > MAX_SIZE) {
      const scale = Math.min(MAX_SIZE / size.width, MAX_SIZE / size.height)
      resized = img.resize({
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
        quality: 'good'
      })
    }

    const localPath = getLocalImagePath(itemCode)
    writeFileSync(localPath, resized.toPNG())

    return localPath
  } catch (err: any) {
    console.warn(`[ImageCache] Error caching image for ${itemCode}: ${err.message}`)
    return null
  }
}

export async function cacheAllImages(
  items: Array<{ item_code: string; image: string | null }>,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  ensureDir()

  // Clean up cached images for items that no longer have a remote image
  const itemCodesWithImages = new Set(items.filter((i) => i.image).map((i) => sanitizeFilename(i.item_code)))
  if (existsSync(IMAGE_DIR)) {
    const cachedFiles = readdirSync(IMAGE_DIR)
    for (const file of cachedFiles) {
      const name = file.replace(/\.png$/, '')
      if (!itemCodesWithImages.has(name)) {
        try {
          unlinkSync(join(IMAGE_DIR, file))
          console.log(`[ImageCache] Removed stale cache: ${file}`)
        } catch {}
      }
    }
  }

  // Only process items that have a remote image
  const itemsWithImages = items.filter((i) => i.image)
  let cached = 0

  for (let i = 0; i < itemsWithImages.length; i++) {
    const item = itemsWithImages[i]

    // Skip if already cached locally
    const localPath = getLocalImagePath(item.item_code)
    if (existsSync(localPath)) {
      cached++
      onProgress?.(i + 1, itemsWithImages.length)
      continue
    }

    const result = await downloadAndCacheImage(item.image!, item.item_code)
    if (result) cached++
    onProgress?.(i + 1, itemsWithImages.length)
  }

  return cached
}

export function clearImageCache(): void {
  if (!existsSync(IMAGE_DIR)) return
  const files = readdirSync(IMAGE_DIR)
  for (const file of files) {
    try {
      unlinkSync(join(IMAGE_DIR, file))
    } catch {}
  }
}
