// The globe's colours, the phone's (ios/Livhold/Theme/Tokens.swift, "the globe
// (A+, iOS #166; mock round 5, 3 Oct 2026)"), in both themes. WebGL cannot read
// CSS variables, so these are literals; the HTML labels over the globe could,
// but share this table so the two never drift.

export interface GlobeTheme {
  ocean: string
  land: string
  /** the countries of your journey and your home */
  mine: string
  border: string
  /** the white rim along the coasts */
  shore: string
  /** the warm rim around the globe */
  glow: string
  glowAltitude: number
  /** behind the route and the names, so they read on land and sea alike */
  halo: string
  /** the route: --ac2Deep */
  route: string
  nameContinent: string
  nameCountry: string
  nameMine: string
  tx: string
  tx2: string
  sf: string
}

export const GLOBE_LIGHT: GlobeTheme = {
  ocean: '#d6e1e4',
  land: '#c9d4ba',
  mine: '#8fa88a',
  border: 'rgba(63, 90, 62, 0.22)',
  shore: 'rgba(255, 255, 255, 0.75)',
  glow: '#f6d6b2',
  glowAltitude: 0.12,
  halo: 'rgba(240, 238, 233, 0.9)',
  route: '#93404c',
  nameContinent: 'rgba(31, 42, 36, 0.5)',
  nameCountry: 'rgba(31, 42, 36, 0.52)',
  nameMine: '#2f4a2e',
  tx: '#1f2a24',
  tx2: '#3f5a3e',
  sf: '#ffffff',
}

export const GLOBE_DARK: GlobeTheme = {
  ocean: '#18212a',
  land: '#2c372f',
  mine: '#4a6148',
  border: 'rgba(216, 224, 229, 0.1)',
  shore: 'rgba(174, 195, 214, 0.12)',
  glow: '#7fa37d',
  glowAltitude: 0.09,
  halo: 'rgba(18, 22, 26, 0.85)',
  route: '#de9ba7',
  nameContinent: 'rgba(216, 224, 229, 0.52)',
  nameCountry: 'rgba(216, 224, 229, 0.55)',
  nameMine: '#a9cba5',
  tx: '#d8e0e5',
  tx2: '#a8b5a8',
  sf: '#1f2622',
}

export const globeTheme = (dark: boolean): GlobeTheme => (dark ? GLOBE_DARK : GLOBE_LIGHT)
