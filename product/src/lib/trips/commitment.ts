// One definition of "is this money really committed", shared by the ledger
// import, the Money page and the budget.
//
// Stays and transport legs carry TWO independent signals and they mean
// different things:
//
//   include — the tick on Stays/Transport: "count this in the plan". It is a
//             forecasting choice; the copy on the Transport tab says so
//             outright ("hold its money in the budget, booked or not").
//   status  — how real it is. idea/shortlist are a DRAFT: a price someone
//             found. chosen/booked mean the booking exists.
//
// Until 2026-09-15 the money numbers read `include` alone for stays, so a
// ticked draft was reported as money owed (owner report: a tester drafted a
// Lisbon flat they had not paid for and the Money page billed them for it).
// Transport had always gated on status; stays now do the same.
//
// The rule everywhere: a draft may inform a FORECAST (projected total, plan
// by stop, the pre-trip estimate) and must never enter a COMMITTED figure
// (spent so far, bookings paid / to pay, "actually committed").
export const isBookedStatus = (status?: string) =>
  ['booked', 'chosen'].includes((status ?? '').toLowerCase())

// Money already gone vs money still ahead. A ledger row dated after today is
// a real, committed cost (a booked stay's charge date, a paid-later fare) but
// it is NOT spend yet, so it never counts towards "spent so far" or a pace.
export const isSettled = (date: string | undefined, todayIso: string) =>
  !!date && date <= todayIso
