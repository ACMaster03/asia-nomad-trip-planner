export const qk = {
  fields: ['fields'] as const,
  cities: ['cities'] as const,
  countries: ['countries'] as const,
  // World data like the cities catalogue, but scoped per city (places lists are
  // only ever read for one city at a time — the /live check-in flow). Keyed by
  // NAME: non-catalogue cities (e.g. a home-country stop) have no city id but
  // still own user places (migration 14).
  places: (cityName: string) => ['places', cityName.toLowerCase()] as const,
}
