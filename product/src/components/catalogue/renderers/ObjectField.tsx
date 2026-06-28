import type { RendererProps } from '../FieldRenderer'
import { SubValue } from './SubValue'

export const ObjectField = ({ value, field }: RendererProps) => {
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const items = field.item_fields ?? []
  return (
    <div className="flex flex-wrap gap-x-3">
      {items.length
        ? items.map((f) => <SubValue key={f.key} item={f} row={obj} />)
        : <span>{JSON.stringify(obj)}</span>}
    </div>
  )
}
