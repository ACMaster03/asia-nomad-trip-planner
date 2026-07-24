import type { SupabaseClient } from '@supabase/supabase-js'

// Free-tier photo pipeline (migration 12): compress hard on the client so the
// 1 GB Storage allowance lasts the whole trip (~250 KB/photo ≈ 4000 photos),
// upload to the public bucket under unguessable uuid paths. Photos need the
// network — offline check-ins queue WITHOUT photos (the outbox persists JSON,
// not blobs; a fair v1 trade).

const MAX_EDGE = 1600
const QUALITY = 0.8

// iPhone cameras hand us HEIC, which Safari's createImageBitmap can't decode
// (dogfood 2026-07-24: uploads failed silently on the phone). The <img>
// element path decodes everything the browser can display — HEIC included on
// iOS — so fall back to it.
async function decodeImage(
  file: File,
): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file)
    return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      try {
        await img.decode()
      } catch {
        // Safari's decode() is known to reject spuriously on large images —
        // fall back to the load event; a truly undecodable file errors here.
        await new Promise<void>((res, rej) => {
          if (img.complete && img.naturalWidth > 0) return res()
          img.onload = () => res()
          img.onerror = () => rej(new Error(`cannot decode ${file.type || 'image'}`))
        })
      }
      if (!img.naturalWidth) throw new Error(`cannot decode ${file.type || 'image'}`)
      return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) }
    } catch (e) {
      URL.revokeObjectURL(url)
      throw e
    }
  }
}

export async function compressImage(file: File): Promise<Blob> {
  const { src, w: iw, h: ih, done } = await decodeImage(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(iw, ih))
    const w = Math.round(iw * scale)
    const h = Math.round(ih * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(src, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', QUALITY))
    if (!blob) throw new Error('Could not process the photo.')
    return blob
  } finally {
    done()
  }
}

export async function uploadCheckinPhotos(
  sb: SupabaseClient,
  tripId: string,
  eventId: string,
  files: File[],
): Promise<string[]> {
  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    // Stage-tagged errors: the /live alert shows this message verbatim, so a
    // field report pinpoints decode vs upload without a debugger.
    let blob: Blob
    try {
      blob = await compressImage(files[i])
    } catch (e) {
      throw new Error(`processing photo ${i + 1}: ${(e as Error)?.message ?? e}`)
    }
    const path = `${tripId}/${eventId}/${i}.jpg`
    const { error } = await sb.storage
      .from('trip-media')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
    if (error) throw new Error(`uploading photo ${i + 1}: ${error.message}`)
    paths.push(path)
  }
  return paths
}

export function publicMediaUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/trip-media/${path}`
}
