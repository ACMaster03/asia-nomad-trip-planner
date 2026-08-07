'use client'
import { useEffect, useMemo, useState } from 'react'
import { useMoney } from '@/lib/trips/Money'
import { useTripScreen } from '@/lib/trips/useTripScreen'
import { useLedgerMutation } from '@/lib/trips/useLedgerMutation'
import { useTripMutation } from '@/lib/trips/useTripMutation'
import { computeBudget, ledgerByMonth, plannedByMonth } from '@/lib/trips/budget'
import { planImports, sourceKey } from '@/lib/trips/importCosts'
import { toBase, monthLabel } from '@/lib/trips/format'
import { SaveError } from '@/components/trips/SaveError'
import { ViewerNotice } from '@/components/trips/ViewerNotice'
import CreateTripEmptyState from '@/components/trips/CreateTripEmptyState'
import { useTripRole } from '@/lib/trips/useTripRole'
import type { LedgerEntry } from '@/lib/trips/types'

// Money · Actual (handoff frame 18). Structure: net hero (earned vs spent
// bars) → one continuous ledger, date-desc, with month dividers. The plan →
// ledger sync, add form and delete flows are unchanged — only the skin.

const newId = (p: string) => p + crypto.randomUUID()
const todayISO = () => new Date().toISOString().slice(0, 10)
const monthDivider = (k: string) =>
  new Date(k + '-01T00:00:00').toLocaleString('en-US', { month: 'long', year: '2-digit' })
const dayShort = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function LedgerTab() {
  const { fmt } = useMoney()
  const { trip, cityIdx } = useTripScreen()
  const mut = useLedgerMutation()
  const stateMut = useTripMutation()
  const { canEdit } = useTripRole()
  // date starts empty to avoid an SSR/hydration mismatch (todayISO is clock-dependent);
  // filled on mount. add() also falls back to todayISO() so submission is always dated.
  const [form, setForm] = useState({ date: '', type: 'income', cat: '', amount: '', cur: '', note: '' })
  const [showForm, setShowForm] = useState(false)
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
    // A viewer must never trigger this: the writes would all bounce off RLS and
    // paint a save-error banner every time they merely OPENED the Money screen.
    if (!canEdit) return
    // Corrections to already-imported rows always apply (one-way sync + orphan
    // flags); NEW rows only flow automatically once the user opted in.
    const ops = [...imp.updates, ...imp.orphans, ...(autoImport ? imp.candidates : [])]
    ops.forEach((entry) => mut.mutate({ kind: 'upsert', entry }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mut is stable; imp derives from trip.data
  }, [imp, autoImport, canEdit])

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

  if (trip.isPending) return <main className="mx-auto max-w-xl p-6">Loading…</main>
  if (!trip.data || !view) return <CreateTripEmptyState />
  const v = view
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

  const input =
    'mt-[7px] w-full rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3 py-3 text-base text-tx outline-none transition-colors duration-[180ms] focus:border-ac'
  const label = 'block min-w-0 text-base font-medium text-tx2'
  const maxFlow = Math.max(1, v.totalInc, v.totalExp)

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-[18px] pb-6 pt-[18px] text-tx">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">Actual</h1>
          <p className="mt-1 text-base leading-normal text-tx2">
            What really came in and went out. Booked costs arrive here on their charge date.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm((x) => !x)}
            className="flex-none rounded-full bg-ac2-soft px-[13px] py-[7px] text-base font-semibold text-ac2-deep"
          >
            ＋ Entry
          </button>
        )}
      </div>
      <ViewerNotice />
      <SaveError show={mut.isError} error={mut.error} />
      <SaveError show={stateMut.isError} error={stateMut.error} />

      {/* hero — net so far */}
      <div className="lv-enter rounded-[var(--r)] bg-sf p-5">
        <div className="text-base font-medium uppercase tracking-[.11em] text-tx2">Net, trip so far</div>
        <div className={'mt-1 text-[32px] font-semibold leading-[1.1] tracking-[-.02em]' + (v.net > 0 ? ' text-ac' : '')}>
          {(v.net > 0 ? '+' : '') + fmt(v.net)}
        </div>
        <p className="mt-1.5 text-base text-tx2">earned minus spent, everything logged so far</p>
        <div className="mt-3.5 flex flex-col gap-3 border-t border-ln pt-3.5">
          {(
            [
              ['Earned', v.totalInc, 'bg-ac'],
              ['Spent', v.totalExp, 'bg-cat-daily'],
            ] as const
          ).map(([k, val, color], i) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-[70px] flex-none text-base text-tx2">{k}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-track">
                <div
                  className={'lv-grow h-full rounded-full ' + color}
                  style={{ width: Math.round((val / maxFlow) * 100) + '%', animationDelay: `${i * 0.06}s` }}
                />
              </div>
              <span className="flex-none text-right text-base font-medium">{fmt(val)}</span>
            </div>
          ))}
        </div>
      </div>

      {canEdit && imp && imp.candidates.length > 0 && !autoImport && (
        <div className="lv-enter rounded-[var(--r)] bg-sf p-4">
          <div className="text-base font-semibold">
            Import your {imp.candidates.length} booked cost{imp.candidates.length > 1 ? 's' : ''}?
          </div>
          <p className="mt-1 text-base leading-normal text-tx2">
            Booked itinerary items with a charge date can sit in the ledger as &ldquo;from booking&rdquo; rows, dated by
            charge date and kept in sync with the Itinerary.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3.5">
            <button
              onClick={importNow}
              disabled={mut.isPending}
              className="rounded-[var(--rCtl)] bg-ac px-[18px] py-2.5 text-base font-semibold text-on disabled:opacity-50"
            >
              Import {imp.candidates.length} item{imp.candidates.length > 1 ? 's' : ''}
            </button>
            <label className="flex items-center gap-2 text-base text-tx2">
              <input type="checkbox" checked={autoFuture} onChange={(e) => setAutoFuture(e.target.checked)} />
              auto-import future bookings too
            </label>
          </div>
        </div>
      )}

      {canEdit && showForm && (
        <div className="lv-enter rounded-[var(--r)] bg-sf p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Date
              <input aria-label="Date" type="date" className={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className={label}>
              Type
              <select aria-label="Type" className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>
            <label className={label}>
              Amount
              <input aria-label="Amount" className={input} type="number" min="0" step="any" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label className={label}>
              Currency
              <select aria-label="Currency" className={input} value={form.cur} onChange={(e) => setForm({ ...form, cur: e.target.value })}>
                <option value="">{baseCur}</option>
                {Object.keys(v.rates).filter((c) => c !== baseCur).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className={label + ' col-span-2'}>
              Category
              <input aria-label="Category" className={input} placeholder="e.g. client work, food" value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} />
            </label>
            <label className={label + ' col-span-2'}>
              Note
              <input aria-label="Note" className={input} placeholder="Optional" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
          </div>
          <button
            onClick={add}
            disabled={mut.isPending}
            className="mt-3.5 w-full rounded-[var(--rCtl)] bg-ac py-3.5 text-base font-semibold text-on disabled:opacity-50"
          >
            Add entry
          </button>
        </div>
      )}

      {/* the ledger — one continuous list, month dividers derived in place */}
      {!v.entries.length ? (
        <p className="text-base text-tx2">
          {canEdit ? 'Nothing logged yet - add an entry, or import your booked costs above.' : 'Nothing logged yet.'}
        </p>
      ) : (
        <div className="rounded-[var(--r)] bg-sf px-4 pb-1.5 text-tx">
          {/* month dividers derive from the already date-desc list: one wherever
              this entry's month differs from the previous entry's */}
          {v.entries.map((e, idx) => {
            const mKey = e.date.slice(0, 7)
            const newMonth = idx === 0 || v.entries[idx - 1].date.slice(0, 7) !== mKey
            const isInc = e.type !== 'expense'
            return (
              <div key={e.id}>
                {newMonth && (
                  <div
                    className={
                      'pb-1 pt-3.5 text-base font-medium uppercase tracking-[.11em] text-tx3' +
                      (idx === 0 ? '' : ' border-t border-ln')
                    }
                  >
                    {monthDivider(mKey)}
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 py-[11px]">
                  <span className="min-w-0">
                    <span className="block text-base font-semibold">{e.note?.trim() || e.category}</span>
                    <span className="block text-base text-tx2">
                      {dayShort(e.date)} · {e.category}
                      {e.source && ' · from booking'}
                      {e.orphaned && <span className="text-warn"> · booking removed</span>}
                      {canEdit && (
                        <>
                          {' · '}
                          <button onClick={() => del(e.id)} className="text-base text-tx3 underline underline-offset-2">
                            delete
                          </button>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="flex-none text-right">
                    <span className={'block text-base font-semibold' + (isInc ? ' text-ac' : '')}>
                      {(isInc ? '+' : '') + fmt(toBase(e.amount, e.currency, v.rates))}
                    </span>
                    {e.currency !== baseCur && (
                      <span className="block text-base text-tx2">
                        {e.amount.toLocaleString('en-US')} {e.currency}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
