import {
  Backpack, Banknote, BedDouble, Binoculars, Briefcase, BriefcaseMedical, Car, Coffee, Droplet, Gift, Glasses, Heart, Landmark, Laptop,
  Link2, Package, Plane, Plus, RadioTower, RefreshCw, Repeat, ShieldCheck, Shirt, ShoppingCart, Store, Undo2, UtensilsCrossed, type LucideIcon,
} from 'lucide-react'

// A category's tile (the phone's CategoryTile, Categories.swift): a rounded
// square in the category's colour with its icon in white. Hollow when the entry
// is out of the daily average by its own switch; a small badge for a row the
// plan wrote (a link) or a subscription's charge (repeat). The colours are the
// phone's, light and dark, in globals.css (--cat-<id>).

const ICONS: Record<string, LucideIcon> = {
  food: UtensilsCrossed, drinks: Coffee, groceries: ShoppingCart, convenience: Store, stays: BedDouble, transport: Plane,
  'local-transport': Car, activities: Binoculars, health: BriefcaseMedical, 'personal-care': Droplet, clothes: Shirt, accessories: Glasses,
  souvenirs: Gift, gear: Backpack, connectivity: RadioTower, subscriptions: RefreshCw, insurance: ShieldCheck, fees: Banknote, giving: Heart,
  other: Package, salary: Briefcase, freelance: Laptop, savings: Landmark, refund: Undo2, 'other-income': Plus,
}
const KNOWN = new Set(Object.keys(ICONS))

/** The category's colour, as a CSS variable; unknown ids take Other's. */
export const categoryColor = (id: string) => `var(--cat-${KNOWN.has(id) ? id : 'other'})`

export function CategoryTile({ id, size = 30, hollow = false, badge }: {
  id: string
  size?: number
  hollow?: boolean
  badge?: 'repeat' | 'link'
}) {
  const Icon = ICONS[id] ?? Package
  const color = categoryColor(id)
  const Badge = badge === 'repeat' ? Repeat : badge === 'link' ? Link2 : null
  return (
    <span
      aria-hidden
      className="relative flex flex-none items-center justify-center"
      style={{ width: size, height: size, borderRadius: size * 0.28, background: hollow ? 'transparent' : color, boxShadow: hollow ? `inset 0 0 0 2px ${color}` : undefined }}
    >
      <Icon className="shrink-0" style={{ width: size * 0.5, height: size * 0.5, color: hollow ? color : '#fff' }} strokeWidth={2.4} />
      {Badge && (
        <span className="absolute -bottom-1 -right-1 flex size-[15px] items-center justify-center rounded-full border border-ln2 bg-sf text-tx2">
          <Badge className="size-[8px]" strokeWidth={3} />
        </span>
      )}
    </span>
  )
}
