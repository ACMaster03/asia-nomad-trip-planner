# Strategy research — 2026-07-10 (12-agent workflow `trip-app-strategy`)

Full outputs of the strategy workflow that produced the approved roadmap, extracted from the
local workflow journal. These are the raw research/design/critique reports; the *decision* they
led to is in [`../APPROVED-PLAN_2026-07-10.md`](../APPROVED-PLAN_2026-07-10.md) and the summary is
in [`../../CONTEXT-RECOVERY.md`](../../CONTEXT-RECOVERY.md).

| File | Contents |
|---|---|
| `01-explore-code-map.md` | Map of the Next.js `product/` app (routes, components, data layer) |
| `02-explore-db-schema-and-docs.md` | Supabase schema + existing docs exploration |
| `03-research-cross-platform-2026.md` | 2026 web+iOS+Android strategy (Expo vs Capacitor vs monorepo) |
| `04-research-integration-apis.md` | Integration APIs: flights, open banking (HU), visa, video, places, FX, weather |
| `05-design-A-nextjs-pwa-capacitor.md` | **Option A** — evolve Next.js, PWA + Capacitor wrapper |
| `06-critique-A.md` | Adversarial critique of Option A |
| `07-design-B-expo-universal.md` | **Option B** — full universal Expo rewrite |
| `08-critique-B.md` | Adversarial critique of Option B |
| `09-design-C-monorepo-hybrid.md` | **Option C** — monorepo hybrid (Next.js web + Expo mobile over shared core) ✅ chosen |
| `10-critique-C.md` | Adversarial critique of Option C |
| `11-design-D-product-business-roadmap.md` | **Option D** — "The Trip Is the Deadline" product/business roadmap |
| `12-critique-D.md` | Adversarial critique of Option D |

**Decision:** Option C (hybrid, phased), shaped by Option D's roadmap. See the plan file.
