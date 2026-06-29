function Pill({ c }: { c: string }) {
  return <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: c }} />
}

export function Legend() {
  return (
    <div className="map-overlay absolute bottom-3 left-3 z-10 max-w-[46vw] rounded-lg border border-[#2a3642] bg-[#0f1419]/80 p-2 text-[11px] leading-relaxed text-[#e8edf2] backdrop-blur md:max-w-none">
      <div className="mb-0.5 font-bold">Legend</div>
      <div>
        <Pill c="#37b3a4" />SE · <Pill c="#6c8ccf" />E · <Pill c="#cf8a6c" />S Asia · <Pill c="#f0a83c" />booked flight
      </div>
      <div className="mt-0.5">⌂ home base · <b>1·2·3…</b> = stop order</div>
      <div className="mt-1 border-t border-[#2a3642] pt-1 font-bold">
        ⚡ Hazards <span className="font-normal text-neutral-400">(toggle on)</span>
      </div>
      <div><Pill c="#ff5a4d" />Earthquake — <b>bigger = stronger</b> (past 7 days)</div>
      <div><Pill c="#f0a83c" />Monsoon / heavy rain this month</div>
      <div className="mt-0.5 text-neutral-400">Tap any marker or country for details.</div>
    </div>
  )
}
