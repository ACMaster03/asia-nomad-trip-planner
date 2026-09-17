import type { PostComment } from './social.ts'

// The comment thread arrives flat and ordered from the database (each
// top-level comment followed by its replies). The post page wants it nested,
// one level deep — this groups it and never invents a deeper level.

export interface CommentThread {
  comment: PostComment
  replies: PostComment[]
}

export function groupThread(flat: readonly PostComment[]): CommentThread[] {
  const byId = new Map<string, CommentThread>()
  const out: CommentThread[] = []
  for (const c of flat) {
    if (c.parent_id === null) {
      const t = { comment: c, replies: [] }
      byId.set(c.id, t)
      out.push(t)
    }
  }
  for (const c of flat) {
    if (c.parent_id !== null) {
      const parent = byId.get(c.parent_id)
      if (parent) parent.replies.push(c)
      // a reply whose parent is not in the list is dropped: the server never
      // sends one, and rendering it unanchored would be a hole
    }
  }
  return out
}

/** Live comments only, the number the feed row shows. */
export function countLive(flat: readonly PostComment[]): number {
  return flat.filter((c) => !c.deleted).length
}
