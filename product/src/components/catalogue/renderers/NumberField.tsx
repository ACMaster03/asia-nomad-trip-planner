import type { RendererProps } from '../FieldRenderer'

export const NumberField = ({ value, field }: RendererProps) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return <span>{String(value)}</span>
  return (
    <span>
      {n.toLocaleString()}
      {field.unit ? ` ${field.unit}` : ''}
    </span>
  )
}
