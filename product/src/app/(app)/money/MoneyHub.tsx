'use client'
import { useState } from 'react'
import { Tabs } from '@/components/trips/Tabs'
import { BudgetTab } from '@/components/trips/BudgetTab'
import { MonthlyTab } from '@/components/trips/MonthlyTab'
import { LedgerTab } from '@/components/trips/LedgerTab'

const TABS = [
  ['budget', 'Budget'],
  ['monthly', 'Monthly'],
  ['ledger', 'Ledger'],
] as const
type TabKey = (typeof TABS)[number][0]

export default function MoneyHub() {
  const [tab, setTab] = useState<TabKey>('budget')
  return (
    <div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'budget' && <BudgetTab />}
      {tab === 'monthly' && <MonthlyTab />}
      {tab === 'ledger' && <LedgerTab />}
    </div>
  )
}
