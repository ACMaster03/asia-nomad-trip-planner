export function SaveError({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
      Couldn&apos;t save your change — it was rolled back. Please retry.
    </div>
  )
}
