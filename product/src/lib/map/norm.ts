// The one way a stop name is matched to a catalogue or route city: drop a
// parenthesised suffix, trim, lowercase. Lives alone so node --test files
// (which resolve no `@/` alias) can import it without pulling the globe in.
export const normCity = (s?: string) => String(s ?? '').split(' (')[0].trim().toLowerCase()
