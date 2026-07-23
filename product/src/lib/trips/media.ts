import type { SupabaseClient } from '@supabase/supabase-js'

// Free-tier photo pipeline (migration 12): compress hard on the client so the
// 1 GB Storage allowance lasts the whole trip (~250 KB/photo ≈ 4000 photos),
// upload to the public bucket under unguessable uuid paths. Photos need the
// network — offline check-ins queue WITHOUT photos (the outbox persists JSON,
// not blobs; a fair v1 trade).

const MAX_EDGE = 1600
const QUALITY = 0.8

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', QUALITY))
  if (!blob) throw new Error('Could not process the photo.')
  return blob
}

export async function uploadCheckinPhotos(
  sb: SupabaseClient,
  tripId: string,
  eventId: string,
  files: File[],
): Promise<string[]> {
  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    const blob = await compressImage(files[i])
    const path = `${tripId}/${eventId}/${i}.jpg`
    const { error } = await sb.storage
      .from('trip-media')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
    if (error) throw error
    paths.push(path)
  }
  return paths
}

export function publicMediaUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/trip-media/${path}`
}
