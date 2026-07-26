import type { SupabaseClient } from '@supabase/supabase-js'

// The irreversible operations (migration 26): delete a trip, leave a trip,
// delete the whole account.
//
// Deleting rows in SQL does NOT delete objects in the trip-media bucket, and
// orphans keep counting against the 1 GB free tier. So every path here purges
// storage FIRST, while the trip still exists — the storage policies gate on
// can_edit_trip(<folder>), so once the trip row is gone the delete is denied
// and the files are stranded with no way to reach them again.

const BUCKET = 'trip-media'

// Photos live at trip-media/<trip_id>/<event_id>/<n>.jpg, so listing is two
// levels deep. Driven by the BUCKET rather than by trip_events rows on
// purpose: a half-failed upload leaves an object with no event referencing it,
// and those are exactly the ones a quota-conscious purge must still catch.
export async function purgeTripMedia(sb: SupabaseClient, tripId: string): Promise<number> {
  const { data: folders, error } = await sb.storage.from(BUCKET).list(tripId, { limit: 1000 })
  // A trip with no photos lists empty; a real failure must NOT be swallowed,
  // or we would delete the trip and silently strand its files.
  if (error) throw error

  const paths: string[] = []
  for (const folder of folders ?? []) {
    // Storage returns files with metadata and folders without it.
    if (folder.id) {
      paths.push(`${tripId}/${folder.name}`)
      continue
    }
    const { data: files, error: fErr } = await sb.storage
      .from(BUCKET)
      .list(`${tripId}/${folder.name}`, { limit: 1000 })
    if (fErr) throw fErr
    for (const f of files ?? []) paths.push(`${tripId}/${folder.name}/${f.name}`)
  }
  if (!paths.length) return 0

  // remove() caps out well below a long trip's photo count, so chunk it.
  for (let i = 0; i < paths.length; i += 100) {
    const { error: rErr } = await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (rErr) throw rErr
  }
  return paths.length
}

// Delete a trip and everything under it. Owner only — enforced by trips_delete
// (`owner = auth.uid()`), so a co-editor's attempt deletes zero rows.
//
// Returns how many photos were purged. Nothing renders it today (the screen
// unmounts the moment the trip is gone), but the purge is the step most likely
// to need explaining after the fact, so the count comes back rather than being
// swallowed.
export async function deleteTrip(sb: SupabaseClient, tripId: string): Promise<number> {
  const photos = await purgeTripMedia(sb, tripId)
  const { error } = await sb.from('trips').delete().eq('id', tripId)
  if (error) throw error
  return photos
}

// Remove YOURSELF from someone else's trip. members_delete allows this for
// your own row; the trip and its data are untouched.
export async function leaveTrip(sb: SupabaseClient, tripId: string): Promise<void> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')
  const { error } = await sb
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', uid)
  if (error) throw error
}

// Erase the account. Purges the media of every trip the caller OWNS first —
// the RPC cascades those trips away, and after that their photos are
// unreachable forever.
//
// Trips they merely joined are left alone: their seat disappears, the trip
// itself belongs to somebody else.
export async function deleteAccount(sb: SupabaseClient): Promise<void> {
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')

  const { data: owned, error } = await sb.from('trips').select('id').eq('owner', uid)
  if (error) throw error
  for (const t of (owned as { id: string }[]) ?? []) {
    // One trip's stuck storage must not block erasing the account — a GDPR
    // request outranks bucket tidiness. Anything left behind is unreachable
    // (its trip row is about to vanish) and can be swept server-side later.
    await purgeTripMedia(sb, t.id).catch(() => 0)
  }

  const { error: rpcErr } = await sb.rpc('delete_my_account')
  if (rpcErr) throw rpcErr
  // The session now points at a user that no longer exists; drop it locally so
  // the app doesn't spend the next navigation retrying a dead token.
  await sb.auth.signOut().catch(() => {})
}
