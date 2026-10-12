// The phone's TravelLoader (ios/Livhold/Components/Waiting.swift), in place of
// every spinner: a 64×14 scene, a dashed line between two hollow circles, and a
// dot that travels from one end to the other and rests at each, 2.4 s a lap.
// Under prefers-reduced-motion it sits still in the middle (globals.css).
export function TravelLoader({ className = '' }: { className?: string }) {
  return (
    <svg width="64" height="14" viewBox="0 0 64 14" aria-hidden className={'text-ac ' + className}>
      <line x1="7" y1="7" x2="57" y2="7" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 4" opacity="0.45" />
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="57" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle className="lv-travel" cx="7" cy="7" r="4" fill="currentColor" />
    </svg>
  )
}

/** The loader with its line under it, where a screen waits for its journey. */
export function Waiting({ label = 'Getting your journey' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3.5 pt-[180px] text-[15px] text-tx2" aria-busy>
      <TravelLoader />
      <span>{label}</span>
    </div>
  )
}
