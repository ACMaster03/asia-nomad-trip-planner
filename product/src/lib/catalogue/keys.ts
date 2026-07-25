export const qk = {
  fields: ['fields'] as const,
  // FULL rows incl. attributes — the map/globe still needs them for hover
  // cards (wifi, landmarks, weather). Kept separate from the lite key so the
  // two never overwrite each other in the cache.
  cities: ['cities'] as const,
  // TIER 2 (migration 20): the light browse list, no attributes — ~92% smaller.
  citiesLite: ['cities-lite'] as const,
  // TIER 1: full rows for the cities actually on the route, which is all the
  // budget needs. Keyed by the route so it refetches when stops change.
  tripCities: (names: string[]) => ['trip-cities', [...names].sort().join('|')] as const,
  countries: ['countries'] as const,
  // World data like the cities catalogue, but scoped per city (places lists are
  // only ever read for one city at a time — the /live check-in flow). Keyed by
  // NAME: non-catalogue cities (e.g. a home-country stop) have no city id but
  // still own user places (migration 14).
  places: (cityName: string) => ['places', cityName.toLowerCase()] as const,
  // FX snapshot + status (migration 19). World data like the catalogue, so it
  // is shared across trips rather than keyed per trip.
  fx: ['fx'] as const,
}
