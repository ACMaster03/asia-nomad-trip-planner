// Handoff frame 19: three entries, dark chrome, fixed colors (the map screen
// stays dark in both themes — dark-set mauve/hunter/amber, not theme vars).
// Sits above the bottom city card (MapClient).
export function Legend({ people = false }: { people?: boolean }) {
  return (
    <div className="absolute bottom-[120px] left-4 z-10 rounded-[calc(var(--r)-2px)] border border-[rgba(216,224,229,.16)] bg-[rgba(11,15,20,.86)] px-3.5 py-3 text-[#d8e0e5] backdrop-blur">
      <div className="text-base uppercase tracking-[.1em] text-[rgba(216,224,229,.6)]">Legend</div>
      <div className="mt-2 flex flex-col gap-[7px] text-base leading-none">
        <span className="flex items-center gap-2">
          <i aria-hidden className="block h-[9px] w-[9px] rounded-full bg-[#D08795]" />Planned stop
        </span>
        <span className="flex items-center gap-2">
          <i aria-hidden className="block h-[9px] w-[9px] rounded-full bg-[#7FA37D]" />Catalogue city
        </span>
        <span className="flex items-center gap-2">
          <i aria-hidden className="block h-[2px] w-[14px] bg-[#D9A85C]" />Hazard
        </span>
        {people && (
          <span className="flex items-center gap-2">
            <i aria-hidden className="flex h-[12px] w-[12px] items-center justify-center rounded-full bg-[#8CB8DC] text-[#0b0f14]">
              <svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor"><circle cx="12" cy="7" r="4" /><path d="M4 21a8 8 0 0 1 16 0z" /></svg>
            </i>People you follow
          </span>
        )}
      </div>
    </div>
  )
}
