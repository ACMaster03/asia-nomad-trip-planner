'use client'
import { useState } from 'react'
import type { Extra } from '@/lib/trips/types'
import { Modal } from './Modal'

const uid = (p: string) => p + crypto.randomUUID()
const label = 'block text-base font-medium text-tx2'
const input =
  'mt-[5px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base font-medium text-tx outline-none transition-colors duration-[180ms] focus:border-ac'
const CATS = ['Visa', 'Insurance', 'Vaccines', 'Gear', 'Flights (intl)', 'SIM/eSIM', 'Other']

export function ExtraForm({
  initial, currencies, onCancel, onSave,
}: {
  initial: Extra | null
  currencies: string[]
  onCancel: () => void
  onSave: (e: Extra) => void
}) {
  const [label_, setLabel] = useState(initial?.label ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'Visa')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [cur, setCur] = useState(initial?.cur ?? 'USD')

  function submit() {
    if (!label_.trim()) { alert('Enter an item'); return }
    const extra: Extra = {
      id: initial?.id ?? uid('ex'),
      label: label_.trim(), category, cur,
      amount: Number(amount) || 0,
      include: initial?.include ?? true,
    }
    onSave(extra)
  }

  return (
    <Modal title={initial ? 'Edit one-off cost' : 'Add one-off cost'} onClose={onCancel}>
      <div className="space-y-3">
        <label className={label}>Item<input className={input} value={label_} onChange={(e) => setLabel(e.target.value)} /></label>
        <div className="grid grid-cols-3 gap-3">
          <label className={label}>Category
            <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className={label}>Amount<input type="number" step="any" className={input} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className={label}>Currency
            <select className={input} value={cur} onChange={(e) => setCur(e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} className="flex-1 rounded-[calc(var(--r)-2px)] bg-ac py-3.5 text-base font-semibold text-on">Save</button>
          <button onClick={onCancel} className="rounded-[calc(var(--r)-2px)] border-[1.5px] border-ln3 px-5 py-3.5 text-base font-semibold text-tx2">Cancel</button>
        </div>
      </div>
    </Modal>
  )
}
