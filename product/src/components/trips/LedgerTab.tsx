'use client'
import { useEffect, useMemo, useState } from 'react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { computeBudget, ledgerByMonth, plannedByMonth } from '@/lib/trips/budget'
import { planImports, sourceKey } from '@/lib/trips/importCosts'
import { toBase, monthLabel } from '@/lib/trips/format'
import { Stat } from '@/components/trips/Stat'
import { SaveError } from '@/components/trips/SaveError'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import type { LedgerEntry } from '@/lib/trips/types'

const newId = (p: string) => p + crypto.randomUUID()
const todayISO = () => new Date().toISOString().slice(0, 10)
const GOOD = 'text-emerald-600'
const BAD = 'text-red-600'

export function LedgerTab() {
  const { fmt } = useMoney()
  const { trip, cityIdx } = useTripScreen()
  const mut = useLedgerMutation()
  const stateMut = useTripMutation()
  // date starts empty to avoid an SSR/hydration mismatch (todayISO is clock-dependent);
  // filled on mount. add() also falls back to todayISO() so submission is always dated.
  const [form, setForm] = useState({ date: '', type: 'income', cat: '', amount: '', cur: '', note: '' })
  const [autoFuture, setAutoFuture] = useState(true)
  useEffect(() => { setForm((f) => (f.date ? f : { ...f, date: todayISO() })) }, [])

  // Plan → ledger sync (importCosts.ts). Converges: every upsert is
  // deterministic, so once the refetched document matches the plan this
  // returns three empty arrays and the effect below no-ops.
  const imp = useMemo(
    () => (trip.data ? planImports(trip.data.state, trip.data.ledger) : null),
    [trip.data],
  )
  const autoImport = trip.data?.state.autoImport
  useEffect(() => {
    if (!imp) return
    // Corrections to already-imported rows always apply (one-way sync + orphan
    // flags); NEW rows only flow automatically once the user opted in.
    const ops = [...imp.updates, ...imp.orphans, ...(autoImport ? imp.candidates : [])]
    ops.forEach((entry) => mut.mutate({ kind: 'upsert', entry }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mut is stable; imp derives from trip.data
  }, [imp, autoImport])

  const view = useMemo(() => {
    if (!trip.data) return null
    const s = trip.data.state
    const ledger = trip.data.ledger
    const rates = s.rates
    let totalInc = 0, totalExp = 0
    ledger.forEach((e) => {
      const huf = toBase(e.amount, e.currency, rates)
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
  const usd = v.rates.USD || 1
  const baseCur = v.s.meta.baseCurrency || 'HUF'

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
      currency: form.cur || baseCur,
      note: form.note.trim(),
    }
    mut.mutate({ kind: 'upsert', entry })
    setForm({ date: todayISO(), type: 'income', cat: '', amount: '', cur: '', note: '' })
  }
  function del(id: string) {
    const entry = trip.data?.ledger.find((e) => e.id === id)
    if (entry?.source) {
      // Without the skip record, reconcile would resurrect the row next visit.
      if (!confirm('Remove this imported cost? The booking stays in your Itinerary, but it won’t be re-imported here.')) return
      const key = sourceKey(entry.source)
      // Persist the skip BEFORE deleting: the two writes live in different
      // scopes, and a ledger refetch landing between them shows "booked cost,
      // no entry, no skip" — the sync effect would re-import the row.
      stateMut.mutate(
        (cur) => ({ ...cur, importSkip: [...new Set([...(cur.importSkip ?? []), key])] }),
        { onSuccess: () => mut.mutate({ kind: 'delete', id }) },
      )
      return
    }
    if (!confirm('Delete this entry?')) return
    mut.mutate({ kind: 'delete', id })
  }

  function importNow() {
    if (!imp) return
    imp.candidates.forEach((entry) => mut.mutate({ kind: 'upsert', entry }))
    stateMut.mutate((cur) => ({ ...cur, autoImport: autoFuture }))
  }

  const input = 'rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900'

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Money — income vs spend</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Log what you actually earn and spend to see, month by month, whether you&apos;re turning a profit.
      </p>
      <SaveError show={mut.isError} error={mut.error} />
      <SaveError show={stateMut.isError} error={stateMut.error} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat k="Total income" v={fmt(v.totalInc)} sub={'~$' + Math.round(v.totalInc / usd)} />
        <Stat k="Total spend" v={fmt(v.totalExp)} sub={'~$' + Math.round(v.totalExp / usd)} />
        <Stat k="Net profit / loss" v={(v.net >= 0 ? '+' : '') + fmt(v.net)} sub={v.net >= 0 ? 'surplus' : 'shortfall'} color={v.net >= 0 ? '#059669' : '#dc2626'} />
        <Stat k="Planned trip cost" v={fmt(v.plan)} sub="your itinerary estimate" />
      </div>

      {imp && imp.candidates.length > 0 && !autoImport && (
        <div className="mt-4 rounded-lg border border-teal-600/40 bg-teal-50 p-4 dark:bg-teal-950/30">
          <div className="font-medium">
            Import your {imp.candidates.length} booked cost{imp.candidates.length > 1 ? 's' : ''}?
          </div>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Booked itinerary items with a charge date can sit in the ledger as ⤵ “from plan” rows, dated by charge date and kept in sync with the Itinerary.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button onClick={importNow} disabled={mut.isPending} className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              Import {imp.candidates.length} item{imp.candidates.length > 1 ? 's' : ''}
            </button>
            <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
              <input type="checkbox" checked={autoFuture} onChange={(e) => setAutoFuture(e.target.checked)} />
              auto-import future bookings too
            </label>
          </div>
        </div>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold">Add an entry</h2>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <input aria-label="Date" type="date" className={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <select aria-label="Type" className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <input aria-label="Category" className={input} placeholder="Category" value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} />
        <input aria-label="Amount" className={input + ' w-24'} type="number" min="0" step="any" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <select aria-label="Currency" className={input} value={form.cur} onChange={(e) => setForm({ ...form, cur: e.target.value })}>
          <option value="">{baseCur}</option>
          {Object.keys(v.rates).filter((c) => c !== baseCur).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input aria-label="Note" className={input + ' flex-1'} placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
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
                  <td className="pr-4">{r.inc ? fmt(r.inc) : '—'}</td>
                  <td className="pr-4">{r.exp ? fmt(r.exp) : '—'}</td>
                  <td className={'pr-4 ' + (r.n >= 0 ? GOOD : BAD)}>{(r.n >= 0 ? '+' : '') + fmt(r.n)}</td>
                  <td className={'pr-4 ' + (r.cum >= 0 ? GOOD : BAD)}>{(r.cum >= 0 ? '+' : '') + fmt(r.cum)}</td>
                  <td className="text-neutral-500">{r.planned ? fmt(r.planned) : '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-neutral-300 font-semibold dark:border-neutral-700">
                <td className="py-1 pr-4">Total</td>
                <td className="pr-4">{fmt(v.totalInc)}</td>
                <td className="pr-4">{fmt(v.totalExp)}</td>
                <td className={'pr-4 ' + (v.net >= 0 ? GOOD : BAD)}>{(v.net >= 0 ? '+' : '') + fmt(v.net)}</td>
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
                    <td className="pr-4 whitespace-nowrap">
                      {e.category}
                      {e.source && (
                        <span className="ml-1.5 rounded border border-teal-600/60 px-1 py-px text-[10px] text-teal-600">⤵ from plan</span>
                      )}
                      {e.orphaned && (
                        <span className="ml-1.5 rounded border border-amber-500/60 px-1 py-px text-[10px] text-amber-600" title="The booking this row came from was removed from the Itinerary.">orphaned</span>
                      )}
                    </td>
                    <td className="pr-4 whitespace-nowrap">{e.amount} {e.currency}</td>
                    <td className="pr-4 text-neutral-500">{fmt(toBase(e.amount, e.currency, v.rates))}</td>
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
