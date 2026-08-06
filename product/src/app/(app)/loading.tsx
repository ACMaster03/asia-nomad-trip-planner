// Instant navigation feedback for every app screen (LIVHOLD frames 34/34b —
// Home's silhouette: header lines, hero card, a row list, a summary block).
// Without a loading boundary, a tap on a nav link shows NOTHING until the
// server render lands (feels broken on slow connections); with one, Next also
// prefetches these dynamic routes up to this boundary, so the shell appears
// immediately. One phase-agnostic skeleton: loading.tsx renders before any
// trip data exists, so it can't know pre-trip from live.
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl p-6" aria-busy>
      <div className="flex items-center gap-3 text-base text-tx2">
        <span className="h-[18px] w-[18px] animate-spin rounded-full border-[2.5px] border-ln2 border-t-tx2" />
        Loading…
      </div>
      <div className="mt-5 animate-pulse space-y-3">
        {/* header: title + position line */}
        <div className="h-7 w-3/5 rounded-lg bg-fill2" />
        <div className="h-4 w-2/5 rounded-md bg-fill2" />
        {/* hero card (next-stop / live hero) */}
        <div className="mt-5 h-56 rounded-[var(--r)] bg-ph" />
        {/* section kicker */}
        <div className="mt-5 h-4 w-1/3 rounded-md bg-fill2" />
        {/* row list (reminders / feed silhouette) */}
        <div className="rounded-[var(--r)] bg-fill px-4 py-0.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-ln py-4 last:border-b-0"
            >
              <div className="h-[34px] w-[34px] flex-none rounded-lg bg-fill2" />
              <div className="min-w-0 grow space-y-1.5">
                <div className="h-3.5 w-3/5 rounded-md bg-fill2" />
                <div className="h-3 w-4/5 rounded-md bg-fill2 opacity-60" />
              </div>
            </div>
          ))}
        </div>
        {/* summary block */}
        <div className="h-24 rounded-[var(--r)] bg-fill" />
      </div>
    </main>
  )
}
