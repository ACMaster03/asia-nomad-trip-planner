// Read a (possibly dotted) key path out of an arbitrary object, e.g.
// getAtJsonPath(city.attributes, 'costs.dailyLiving') -> { low, mid, high }.
export function getAtJsonPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
    obj,
  )
}
