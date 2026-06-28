import type { RendererProps } from '../FieldRenderer'

export const NumberField = ({ value, field }: RendererProps) => (
  <span>
    {Number(value).toLocaleString()}
    {field.unit ? ` ${field.unit}` : ''}
  </span>
)
