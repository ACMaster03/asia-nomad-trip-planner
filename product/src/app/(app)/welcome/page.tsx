import { Suspense } from 'react'
import PersonalisationFlow from './PersonalisationFlow'

// Personalisation flow (handoff section F) — runs straight after Create trip;
// ?short=1 is the co-editor variant. Suspense because the flow reads
// useSearchParams.
export default function WelcomePage() {
  return (
    <Suspense>
      <PersonalisationFlow />
    </Suspense>
  )
}
