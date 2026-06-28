import type { RendererProps } from '../FieldRenderer'
import { SubValue } from './SubValue'

export const ListField = ({ value, field }: RendererProps) => {
  const rows = (Array.isArray(value) ? value : []) as Record<string, unknown>[]
  const items = field.item_fields ?? []
  return (
    <ul className="space-y-1">
      {rows.map((row, i) => (
        <li key={i}>
          {items.length
            ? items.map((f) => <SubValue key={f.key} item={f} row={row} />)
            : JSON.stringify(row)}
        </li>
      ))}
    </ul>
  )
}
