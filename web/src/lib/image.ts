// Client-side resize before upload: longest edge at most 1280 px, JPEG quality 0.8.
const MAX_EDGE = 1280
const QUALITY = 0.8

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() }
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

export async function resizeToJpeg(file: Blob): Promise<Blob> {
  const { src, w, h, close } = await decode(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cw, ch)
    ctx.drawImage(src, 0, 0, cw, ch)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', QUALITY))
    if (!blob) throw new Error('encode failed')
    return blob
  } finally {
    close()
  }
}
