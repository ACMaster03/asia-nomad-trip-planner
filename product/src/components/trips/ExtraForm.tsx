'use client'
import { useState } from 'react'
import type { Extra } from '@/lib/trips/types'
import { Modal } from './Modal'

const uid = (p: string) => p + Math.random().toString(36).slice(2, 8)
const input = 'mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900'
const CATS = ['Visa', 'Insurance', 'Vaccines', 'Gear', 'Flights (intl)', 'SIM/eSIM', 'Other']

export function ExtraForm({
  initial, currencies, onCancel, onSave,
}: {
  initial: Extra | null
  currencies: string[]
  onCancel: () => void
  onSave: (e: Extra) => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'Visa')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [cur, setCur] = useState(initial?.cur ?? 'USD')

  function submit() {
    if (!label.trim()) { alert('Enter an item'); return }
    const extra: Extra = {
      id: initial?.id ?? uid('ex'),
      label: label.trim(), category, cur,
      amount: Number(amount) || 0,
      include: initial?.include ?? true,
    }
    onSave(extra)
  }

  return (
    <Modal title={initial ? 'Edit one-off cost' : 'Add one-off cost'} onClose={onCancel}>
      <div className="space-y-3">
        <label className="block text-sm">Item<input className={input} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">Category
            <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="block text-sm">Amount<input type="number" step="any" className={input} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="block text-sm">Currency
            <select className={input} value={cur} onChange={(e) => setCur(e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white">Save</button>
          <button onClick={onCancel} className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}
