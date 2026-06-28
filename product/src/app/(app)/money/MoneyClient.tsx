'use client'
import { useMemo, useState } from 'react'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import { computeBudget, ledgerByMonth, plannedByMonth } from '@/lib/trips/budget'
import { fmtHUF, toHUF, monthLabel } from '@/lib/trips/format'
import { Stat } from '@/components/trips/Stat'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import type { LedgerEntry } from '@/lib/trips/types'

const newId = (p: string) => p + Math.random().toString(36).slice(2, 8)
const todayISO = () => new Date().toISOString().slice(0, 10)
const GOOD = 'text-emerald-600'
const BAD = 'text-red-600'

export default function MoneyClient() {
  const { trip, cityIdx } = useTripScreen()
  const tripId = trip.data?.id ?? ''
  const mut = useLedgerMutation(tripId)
  const [form, setForm] = useState({ date: todayISO(), type: 'income', cat: '', amount: '', cur: '', note: '' })

  const view = useMemo(() => {
    if (!trip.data) return null
    const s = trip.data.state
    const ledger = trip.data.ledger
    const rates = s.rates
    let totalInc = 0, totalExp = 0
    ledger.forEach((e) => {
      const huf = toHUF(e.amount, e.currency, rates)
      if (e.type === 'expense') totalExp += huf
      else totalInc += huf
    })
    const net = totalInc - totalExp
    const plan = computeBudget(s, cityIdx).grand
    const lm = ledgerByMonth(ledger, rates)
    const plan2 = plannedByMonth(s, cityIdx)
    const months = [...new Set<string>([...lm.order, ...Object.keys(plan2)])].sort()
    let cum = 0
    const rows = months.map((k) => {
      const inc = lm.M[k]?.inc || 0
      const exp = lm.M[k]?.exp || 0
      const n = inc - exp
      cum += n
      return { k, label: monthLabel(k), inc, exp, n, cum, planned: plan2[k] || 0 }
    })
    const entries = ledger.slice().sort((a, x) => (a.date < x.date ? 1 : -1))
    return { s, rates, totalInc, totalExp, net, plan, rows, entries }
  }, [trip.data, cityIdx])

  if (trip.isPending) return <main className="mx-auto max-w-5xl p-6">Loading…</main>
  if (!trip.data || !view) return <CreateTripEmptyState />
  const v = view
  const ledger = trip.data.ledger

  function add() {
    const amt = parseFloat(form.amount)
    if (!isFinite(amt) || amt <= 0) {
      alert('Enter an amount greater than 0.')
      return
    }
    const entry: LedgerEntry = {
      id: newId('le'),
      date: form.date || todayISO(),
      type: form.type === 'expense' ? 'expense' : 'income',
      category: form.cat.trim() || '(uncategorised)',
      amount: amt,
      currency: form.cur || v.s.meta.baseCurrency || 'HUF',
      note: form.note.trim(),
    }
    mut.mutate([...ledger, entry])
    setForm({ date: todayISO(), type: 'income', cat: '', amount: '', cur: '', note: '' })
  }
  function del(id: string) {
    if (!confirm('Delete this entry?')) return
    mut.mutate(ledger.filter((x) => x.id !== id))
  }

  const input = 'rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900'

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Money — income vs spend</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Log what you actually earn and spend to see, month by month, whether you&apos;re turning a profit.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat k="Total income" v={fmtHUF(v.totalInc)} sub={'~$' + Math.round(v.totalInc / v.rates.USD)} />
        <Stat k="Total spend" v={fmtHUF(v.totalExp)} sub={'~$' + Math.round(v.totalExp / v.rates.USD)} />
        <Stat k="Net profit / loss" v={(v.net >= 0 ? '+' : '') + fmtHUF(v.net)} sub={v.net >= 0 ? 'surplus' : 'shortfall'} color={v.net >= 0 ? '#059669' : '#dc2626'} />
        <Stat k="Planned trip cost" v={fmtHUF(v.plan)} sub="your itinerary estimate" />
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Add an entry</h2>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <input type="date" className={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <input className={input} placeholder="Category" value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} />
        <input className={input + ' w-24'} type="number" min="0" step="any" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <select className={input} value={form.cur} onChange={(e) => setForm({ ...form, cur: e.target.value })}>
          <option value="">{v.s.meta.baseCurrency || 'HUF'}</option>
          {Object.keys(v.rates).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input className={input + ' flex-1'} placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button onClick={add} disabled={mut.isPending} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          + Add
        </button>
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Monthly profit &amp; loss</h2>
      {!v.rows.length ? (
        <p className="text-sm text-neutral-500">No data yet — add an entry above, or build your itinerary so planned spend shows here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="py-1 pr-4">Month</th>
                <th className="pr-4">Income</th>
                <th className="pr-4">Spend</th>
                <th className="pr-4">Net</th>
                <th className="pr-4">Cumulative</th>
                <th>Planned</th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.k} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1 pr-4 font-medium">{r.label}</td>
                  <td className="pr-4">{r.inc ? fmtHUF(r.inc) : '—'}</td>
                  <td className="pr-4">{r.exp ? fmtHUF(r.exp) : '—'}</td>
                  <td className={'pr-4 ' + (r.n >= 0 ? GOOD : BAD)}>{(r.n >= 0 ? '+' : '') + fmtHUF(r.n)}</td>
                  <td className={'pr-4 ' + (r.cum >= 0 ? GOOD : BAD)}>{(r.cum >= 0 ? '+' : '') + fmtHUF(r.cum)}</td>
                  <td className="text-neutral-500">{r.planned ? fmtHUF(r.planned) : '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-neutral-300 font-semibold dark:border-neutral-700">
                <td className="py-1 pr-4">Total</td>
                <td className="pr-4">{fmtHUF(v.totalInc)}</td>
                <td className="pr-4">{fmtHUF(v.totalExp)}</td>
                <td className={'pr-4 ' + (v.net >= 0 ? GOOD : BAD)}>{(v.net >= 0 ? '+' : '') + fmtHUF(v.net)}</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold">All entries</h2>
      {!v.entries.length ? (
        <p className="text-sm text-neutral-500">Nothing logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="py-1 pr-4">Date</th>
                <th className="pr-4">Type</th>
                <th className="pr-4">Category</th>
                <th className="pr-4">Amount</th>
                <th className="pr-4">In HUF</th>
                <th className="pr-4">Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {v.entries.map((e) => {
                const isInc = e.type !== 'expense'
                return (
                  <tr key={e.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="py-1 pr-4 whitespace-nowrap">{e.date}</td>
                    <td className={'pr-4 ' + (isInc ? GOOD : BAD)}>{isInc ? 'income' : 'expense'}</td>
                    <td className="pr-4">{e.category}</td>
                    <td className="pr-4 whitespace-nowrap">{e.amount} {e.currency}</td>
                    <td className="pr-4 text-neutral-500">{fmtHUF(toHUF(e.amount, e.currency, v.rates))}</td>
                    <td className="pr-4 text-neutral-500">{e.note}</td>
                    <td>
                      <button onClick={() => del(e.id)} className="text-xs text-red-600 hover:underline">delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
