import type { RendererProps } from '../FieldRenderer'

export const TextField = ({ value }: RendererProps) => <span>{String(value)}</span>
