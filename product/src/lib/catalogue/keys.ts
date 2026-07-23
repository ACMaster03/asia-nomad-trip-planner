export const qk = {
  fields: ['fields'] as const,
  cities: ['cities'] as const,
  countries: ['countries'] as const,
  // World data like the cities catalogue, but scoped per city (places lists are
  // only ever read for one city at a time — the /live check-in flow).
  places: (cityId: number) => ['places', cityId] as const,
}
