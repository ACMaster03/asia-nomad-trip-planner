export function Stat({ k, v, sub, color }: { k: string; v: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-[var(--r)] border border-ln bg-sf p-3">
      <div className="text-base uppercase tracking-wide text-tx3">{k}</div>
      <div className="text-lg font-semibold" style={color ? { color } : undefined}>{v}</div>
      {sub && <div className="mt-1 text-base text-tx3">{sub}</div>}
    </div>
  )
}
