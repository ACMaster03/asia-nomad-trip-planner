import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchTripRole } from './role.ts'

// A Supabase client with only what fetchTripRole touches: auth.getUser,
// auth.getSession, and a trips / trip_members read by id.
function fake(opts: {
  user?: string | null
  userError?: Error
  session?: string | null
  owner?: string | null
  member?: string | null
}): SupabaseClient {
  const rows: Record<string, unknown> = {
    trips: opts.owner === null ? null : { owner: opts.owner ?? 'u1' },
    trip_members: opts.member ? { role: opts.member } : null,
  }
  const chain = (table: string) => ({
    select: () => chain(table),
    eq: () => chain(table),
    maybeSingle: async () => ({ data: rows[table], error: null }),
  })
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ? { id: opts.user } : null }, error: opts.userError ?? null }),
      getSession: async () => ({ data: { session: opts.session ? { user: { id: opts.session } } : null }, error: null }),
    },
    from: chain,
  } as unknown as SupabaseClient
}

test('the owner, an editor, a viewer, and no relationship', async () => {
  assert.equal(await fetchTripRole(fake({ user: 'u1', owner: 'u1' }), 't'), 'owner')
  assert.equal(await fetchTripRole(fake({ user: 'u2', owner: 'u1', member: 'editor' }), 't'), 'editor')
  assert.equal(await fetchTripRole(fake({ user: 'u2', owner: 'u1', member: 'viewer' }), 't'), 'viewer')
  assert.equal(await fetchTripRole(fake({ user: 'u2', owner: 'u1' }), 't'), 'none')
  assert.equal(await fetchTripRole(fake({ user: 'u1', owner: null }), 't'), 'none')
})

test('the auth server cannot be asked: the session on the device answers, and with none the lookup fails rather than saying "no access" (Petra, 14 Oct)', async () => {
  const blip = new Error('fetch failed')
  assert.equal(await fetchTripRole(fake({ user: null, userError: blip, session: 'u1', owner: 'u1' }), 't'), 'owner')
  await assert.rejects(fetchTripRole(fake({ user: null, userError: blip, session: null, owner: 'u1' }), 't'), blip)
  // signed out for real: no user, no session, no error
  assert.equal(await fetchTripRole(fake({ user: null, session: null, owner: 'u1' }), 't'), 'none')
  // a uid handed in (the server layout) asks nobody
  assert.equal(await fetchTripRole(fake({ user: null, userError: blip, owner: 'u1' }), 't', 'u1'), 'owner')
})
