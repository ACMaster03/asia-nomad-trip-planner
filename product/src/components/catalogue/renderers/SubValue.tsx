import type { ItemField } from '@/lib/catalogue/types'
import { getAtJsonPath } from '@/lib/catalogue/getAtJsonPath'

// Generic renderer for one sub-field of a list/object, driven entirely by its
// ItemField descriptor — so adding a sub-field in catalogue_fields.item_fields
// shows up with zero code change. Recurses for nested lists.
export function SubValue({ item, row }: { item: ItemField; row: Record<string, unknown> }) {
  const v = getAtJsonPath(row, item.key)
  if (v == null || v === '') return null

  if (item.type === 'list' && Array.isArray(v)) {
    return (
      <ul className="ml-3 list-disc">
        {(v as Record<string, unknown>[]).map((sub, i) => (
          <li key={i}>
            {(item.item_fields ?? []).map((f) => (
              <SubValue key={f.key} item={f} row={sub} />
            ))}
          </li>
        ))}
      </ul>
    )
  }

  const unit = item.unit ? ` ${item.unit}` : ''
  return (
    <span className="mr-2">
      <b className="text-neutral-500">{item.label}:</b> {String(v)}
      {unit}
    </span>
  )
}
