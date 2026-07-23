// Instant navigation feedback for every app screen. Without a loading
// boundary, a tap on a nav link shows NOTHING until the server render lands
// (feels broken on slow connections); with one, Next also prefetches these
// dynamic routes up to this boundary, so the shell appears immediately.
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl p-6" aria-busy>
      <div className="flex items-center gap-3 text-sm text-neutral-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-teal-600" />
        Loading…
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-7 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-4 w-72 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          ))}
        </div>
      </div>
    </main>
  )
}
