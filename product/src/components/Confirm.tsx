'use client'
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Modal } from '@/components/trips/Modal'

// A confirmation in the app's own clothes.
//
// Every destructive action used to call window.confirm(), which iOS draws in
// its own style: white box, blue Cancel/OK, system font. Correct, and visibly
// not this app (reported 2026-09-20). It also cannot say more than one
// sentence, cannot mark the destructive choice as destructive, and on the
// photo-upload path had to smuggle a three-way decision into OK/Cancel.
//
// PROMISE-BASED on purpose. window.confirm() is synchronous, so the call sites
// read `if (!confirm(...)) return` in the middle of a function. A React dialog
// that resolves a promise keeps them reading the same way, which is why this
// is a provider and a hook rather than a component each caller has to host.

type Ask = {
  title: string
  body?: string
  /** the destructive button; defaults to "Delete" */
  confirmLabel?: string
  cancelLabel?: string
  /** false for a neutral choice, e.g. "post without photos" */
  destructive?: boolean
}

// FAILS CLOSED. If a tree ever renders without the provider, the alternative
// default deletes things with no question asked; this one just declines. A
// delete button that does nothing is a bug report. A delete button that skips
// its confirmation is lost data.
const ConfirmCtx = createContext<(ask: Ask) => Promise<boolean>>(async () => false)

/** `if (!(await confirm({ title: 'Delete this stop?' }))) return` */
export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null)
  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((next: Ask) => {
    // A second ask while one is open would strand the first promise forever
    // and leak whatever awaited it. Decline the newcomer instead.
    if (resolveRef.current) return Promise.resolve(false)
    setAsk(next)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const settle = (v: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setAsk(null)
    resolve?.(v)
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {ask && (
        // Closing by scrim or Escape is a cancel: dismissing a question about
        // deleting something must never be read as agreeing to it.
        <Modal title={ask.title} onClose={() => settle(false)}>
          {ask.body && <p className="text-base leading-normal text-tx2">{ask.body}</p>}
          <div className="mt-4 flex gap-2.5">
            <button
              onClick={() => settle(true)}
              className={
                'flex-1 rounded-[var(--rCtl)] py-3 text-base font-semibold ' +
                (ask.destructive === false
                  ? 'bg-ac text-on'
                  : 'border-[1.5px] border-warn-line bg-warn-soft text-warn')
              }
            >
              {ask.confirmLabel ?? 'Delete'}
            </button>
            <button
              onClick={() => settle(false)}
              className="rounded-[var(--rCtl)] border-[1.5px] border-ln3 px-5 py-3 text-base font-medium text-tx2"
            >
              {ask.cancelLabel ?? 'Cancel'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  )
}
