import type { RendererProps } from '../FieldRenderer'

export const RangeField = ({ value, field }: RendererProps) => {
  if (!Array.isArray(value)) return <span>{String(value)}</span>
  const [lo, hi] = value as [number, number]
  const u = field.unit ?? ''
  return <span>{`${u}${lo}–${u}${hi}`}</span>
}
