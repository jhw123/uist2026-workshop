import type { Crop } from './types'

const cache = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  if (!cache.has(src)) {
    cache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Could not load image ' + src.slice(0, 60)))
        img.src = src
      }),
    )
  }
  return cache.get(src)!
}

function draw(img: HTMLImageElement, crop: Crop | null, maxSide = 1400): string {
  const sx = crop ? crop.x * img.naturalWidth : 0
  const sy = crop ? crop.y * img.naturalHeight : 0
  const sw = crop ? crop.w * img.naturalWidth : img.naturalWidth
  const sh = crop ? crop.h * img.naturalHeight : img.naturalHeight
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(sw * scale))
  c.height = Math.max(1, Math.round(sh * scale))
  c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

export async function toDataUrl(src: string, crop: Crop | null = null): Promise<string> {
  const img = await loadImage(src)
  return draw(img, crop)
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
