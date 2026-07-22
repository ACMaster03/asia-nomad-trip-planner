Research complete. Below is the report.

---

# 2026 Integration Research — Travel Planning + Live-Trip-Following App (Supabase + Vercel, EU/HU, tiny budget)

Note on currency: prices are as published (USD unless noted). Dates/pricing verified July 2026. Uncertainty flagged inline. "Free-forever for an MVP" candidates are marked ✅.

---

## 1. Flight tracking / flight status APIs

| Provider | Free tier | Cheapest paid | Notes |
|---|---|---|---|
| **FlightAware AeroAPI v3** | **STARTER: 500 req/mo free**, 5 q/min | Bronze $25/mo (2,500 req), Silver $99/mo (20k), Gold $249/mo (100k), Platinum $999/mo (500k) + $0.0015/extra query | Flat monthly subscription (moved away from pure per-query). Highest data quality/reputation. PiAware/FlightFeeder self-hosters get +500 queries. |
| **AeroDataBox (via RapidAPI / api.market)** | **Basic: 600 "units"/mo free** | Pro $5.35/mo, Ultra $32/mo, Mega $160/mo | Best price/value for a hobby project. Billed in "units" not requests — endpoint cost varies by TIER 1–4. Good schedule + live coverage (US ~100% sched/86% live; FR 92%/79%). ⚠️ 2026 change: Flight Alert API moving to credit-based billing — code changes required before **April 4, 2026**; re-subscription needed if you subscribed pre-2026. |
| **aviationstack** | **100 req/mo free** | Professional up to $499.99/mo (tiered) | Cleanest docs, easy entry, but tiny free tier and real-time updates delayed ~30–60s. Free tier HTTP-only historically. Good for prototyping reference data (airlines/airports/routes). |
| **Flightradar24 API (fr24api)** | No true free tier (credit-based) | ~$9/mo for 30,000 API calls → up to ~$900/mo for ~4.05M calls; top-up credit packs | Best live positional/map data + brand recognition. Credit model, pay for what you use. ⚠️ fr24api pricing page didn't render for exact tier extraction — the $9/30k figure is from search aggregation, verify at source. |

**Recommendation:** Start on **AeroDataBox** (600 free units/mo, then $5.35/mo Pro) for flight status + schedules on a tiny budget — best value. Keep **FlightAware AeroAPI STARTER (500/mo free)** as a quality fallback/second source. Use **Flightradar24** only if you need live map/positional tracking for the "live trip following" feature and can absorb credit costs. Avoid building on aviationstack's 100/mo free tier beyond a prototype.

Sources: https://www.flightaware.com/commercial/aeroapi/v3/pricing.rvt · https://aerodatabox.com/pricing/ · https://aerodatabox.com/flight-alert-api-2026/ · https://aviationstack.com/pricing · https://fr24api.flightradar24.com/subscriptions-and-credits

---

## 2. Weather forecast APIs

| Provider | Free tier | Paid | Notes |
|---|---|---|---|
| **Open-Meteo** ✅ | **Free for non-commercial**, <10,000 calls/day (5,000/hr, 600/min), no API key | Commercial: Standard 1M calls/mo, Professional 5M/mo, Enterprise 50M+/mo (monthly call-budget pricing, ~€29+/mo tier historically; adds API key, dedicated endpoint, 99.9% SLA, commercial licence) | Best free option. No key, excellent forecast data, open-source. ⚠️ Free tier is **non-commercial only** — a commercial app technically needs a paid plan (or self-host: Open-Meteo is open source and self-hostable to avoid per-call limits). Monthly limits not yet strictly enforced (usage portal still being built). |
| **OpenWeather** | **One Call 3.0/4.0: 1,000 calls/day free**, then pay-as-you-go per call above; legacy free tier ~60 calls/min | Pay-as-you-go beyond 1,000/day | Requires card on file for One Call. Reliable, widely used. Good if you need current + minute/hourly/daily in one call. |

**Recommendation:** **Open-Meteo** for forecasts. Cheapest and cleanest. Because the free tier is non-commercial, either (a) buy the modest commercial plan once you monetize, or (b) **self-host Open-Meteo** on your own infra to sidestep both cost and licence issues at scale. Use **OpenWeather One Call (1,000/day free)** as a secondary source or for features Open-Meteo lacks.

Sources: https://open-meteo.com/en/pricing · https://openmeteo.substack.com/p/api-subscriptions-for-commercial · https://openweathermap.org/price · https://openweathermap.org/api/one-call-3

---

## 3. FX / currency rate APIs

| Provider | Free tier | Notes |
|---|---|---|
| **Frankfurter (frankfurter.dev)** ✅ | **Fully free, no key, no published rate limit** (fair use) | ECB reference rates as clean JSON, 201 currencies (blended across ~84 central banks; can scope to ECB). Historical back to 1999-01-04. **End-of-day only** (updated ~16:00 CET each working day) — not intraday/real-time. Open-source & self-hostable. Hosts: api.frankfurter.dev / api.frankfurter.app. |
| **exchangerate.host** (APILayer) | **Free: 100 requests/mo, $0**, API key required | ⚠️ Status change: no longer the old "unlimited free" service — now an APILayer freemium product. Basic $14.99/mo (10k req), Professional Plus $59.99/mo (100k), Business $99.99/mo (500k). ~99.9% uptime. Free tier too small for production. |

**Recommendation:** Use **Frankfurter** as the primary rates source — it's genuinely free, no key, ECB-official, and ideal for a travel app where daily rates are fine. Given the app already has a `/rates` doc, back Frankfurter with a daily cron caching rates into Supabase (removes any dependency/rate-limit worry and gives you instant reads). Only consider exchangerate.host paid tiers if you need intraday/tick data or many exotic pairs Frankfurter lacks.

Sources: https://frankfurter.dev/ · https://frankfurter.dev/v1/ · https://exchangerate.host/pricing

---

## 4. Visa / entry-requirement data

| Source | Access | Cost | Notes |
|---|---|---|---|
| **sherpa° (joinsherpa) Requirements API** | Partner application (use case, volume, timeline) → credentials | **Revenue-share model, no public price**; monetizes via eVisa/ancillary sales | The realistic commercial API for visa/passport/transit/vaccination requirements, 200+ nationalities × 200+ destinations. Not self-serve — you must apply and likely need volume/booking flow to be interesting to them. |
| **IATA Timatic** | Enterprise/airline contract only | Expensive, gated | The authoritative source airlines use. Not accessible to a tiny startup. |
| **Passport Index / passportindex.org** | Datasets exist (some scraped/mirrored on GitHub) | Free-ish data, no official supported API | Good for **passport-to-country visa-free/visa-on-arrival matrices** (the "how many days can I stay / do I need a visa" table), not detailed document rules. |

**Recommendation:** There is **no cheap, self-serve, authoritative programmatic visa API** in 2026. Two-track approach: (1) For the common "does passport X need a visa for country Y" matrix, use free/open **Passport Index-style datasets** (curate into your own Supabase table, refresh periodically). (2) For detailed entry requirements, either apply to **sherpa°** (revenue-share; viable only if you'll drive eVisa sales) or **curate your own** data for your target corridors (e.g. Asia nomad routes) and show a disclaimer + link to official sources. Treat visa data as curated/manual for MVP.

Sources: https://www.joinsherpa.com/solutions · https://docs.joinsherpa.io/requirements-api/quickstart.html · https://www.joinsherpa.com/products/travel-requirements

---

## 5. Cost-of-living / daily-cost data

| Source | Cost | Notes |
|---|---|---|
| **Numbeo Data API** | **No free tier.** Basic **$260/mo** (200k queries), Professional **$480/mo** (1M), Enterprise **$1,250/mo** (5M) | The canonical cost-of-living dataset (prices, property, quality-of-life) but expensive for a tiny budget. VAT added. Cancel anytime. |
| **Numbeo scrapers (e.g. Apify)** | Low-cost / per-run | ⚠️ ToS/licensing risk — scraping Numbeo violates their terms; not recommended for a product. |
| **Curate-your-own** | Free (your effort) | Numbeo publishes public ranking pages; you can build a lightweight per-city daily-budget estimate from a mix of public sources + user-submitted check-in spend. |

**Recommendation:** **Numbeo API is out of budget** at $260/mo minimum. For MVP, **curate your own** per-city daily-cost tiers (budget/mid/luxury) for your target destinations — a few hundred rows in Supabase. Enrich over time with **user-submitted actual spend** from the trip-following/expense feature (turns a cost problem into a data moat). Revisit Numbeo's paid API only once revenue supports it.

Sources: https://www.numbeo.com/common/api.jsp · https://www.numbeo.com/cost-of-living/

---

## 6. EU open banking (auto expense import)

⚠️ **Key finding + conflict to flag:** One authoritative-ish source (openbankingtracker) states **GoCardless Bank Account Data (ex-Nordigen) is "closed to new signups and being wound down."** However, this **conflicts** with evidence that the self-serve portal `bankaccountdata.gocardless.com` is **still operational in 2026** and actively used by open-source apps (Actual Budget, Firefly III — the Firefly III community was discussing GoCardless *introducing rate limiting* in 2026, which implies the free service still exists). **Verify directly at signup before building on it.**

| Provider | Free/entry access | Coverage relevant to you | Notes |
|---|---|---|---|
| **GoCardless Bank Account Data (ex-Nordigen)** | Historically **free AIS** (self-serve, no card), connections valid ~90 days; **rate limits tightened in 2026** (per Firefly III discussion) | 2,200–2,500+ banks UK/EEA incl. **Hungary (OTP, etc.)**; **Revolut** supported | Still the most generous free AIS tier *if* signups remain open. Solo/self-data access is free. ⚠️ Availability uncertain — see conflict above. |
| **Enable Banking** ✅ | **Free "Restricted Production"** (real data, but only accounts you whitelist yourself) | Documents HU market explicitly: **OTP Bank, K&H, Raiffeisen, MBH**; self-serve Control Panel signup, JWT REST, SDKs | **The recommended GoCardless replacement.** Full production needs signed contract + KYB. Great for MVP/personal-scope testing. |
| **Tink** (Visa) | Free test/sandbox; production = sales | Strong EU incl. HU | Transaction-based pricing, enterprise contracts. Overkill for tiny budget. |
| **Plaid** | Unlimited sandbox; **Trial ~10 live Items** free, then upgrade | EU/UK production requires sales | US-centric; EU coverage weaker than local players. |
| **Salt Edge / TrueLayer / Yapily** | TrueLayer & Yapily: **free sandbox + pay-as-you-go**; Salt Edge: subscription, sales-led | Broad EU incl. HU | TrueLayer/Yapily PAYG suit early-stage teams. |
| **Revolut / Wise direct APIs** | Revolut Business API / Wise API exist | Revolut = LT banking licence (LT-IBAN, not HU-IBAN); Wise gives HU account details | Direct APIs are for the account *holder's own* transactions (good for a nomad importing their own Revolut/Wise spend), not third-party aggregation. Useful because many HU nomads use Revolut/Wise. |

**Recommendation:** Primary = **Enable Banking** (free Restricted Production, explicit OTP/HU coverage, self-serve, purpose-built as the Nordigen successor) for MVP and personal-scope expense import. Keep **GoCardless Bank Account Data** as an option *only after confirming signups are still open* — if so, it's the cheapest path at low volume across 2,200+ EU banks incl. OTP + Revolut. For nomads on **Revolut/Wise**, their **direct APIs** are the simplest self-data import. Defer Tink/Plaid/Salt Edge until you have volume + revenue (all sales-gated for EU production).

Sources: https://www.openbankingtracker.com/guides/free-open-banking-apis · https://enablebanking.com/docs/markets/hu/ · https://www.openbankingtracker.com/providers/country/hu · https://developer.gocardless.com/bank-account-data/overview · https://actualbudget.org/docs/advanced/bank-sync/gocardless/ · https://github.com/orgs/firefly-iii/discussions/9138

---

## 7. Photo/video upload + streaming (social travel feed)

| Provider | Free tier | Pricing at small scale | Notes |
|---|---|---|---|
| **Supabase Storage** (you already run Supabase) | Free: **1 GB storage + 5 GB egress**; Pro $25/mo: **100 GB storage + 250 GB egress**, then **$0.09/GB** storage egress, $0.021/GB storage over 100 GB | Cheapest for **images** and short clips since it's in your stack | No transcoding/adaptive streaming — you'd serve raw files. Fine for photos + short MP4s. Pair with a CDN/image transform. |
| **Cloudflare Images** | Paid add-on | **Storage $5 / 100,000 images**; **Delivery $1 / 100,000 delivered/mo**; remote transforms $0.50/1,000 after first 5,000 | Extremely cheap for a photo-heavy feed with on-the-fly resizing/variants. |
| **Cloudflare Stream** | No free tier | **Storage $5 / 1,000 min stored**; **Delivery $1 / 1,000 min delivered**; ingest+encoding free, no egress fees | Simplest predictable video pricing; bandwidth included. Great for a video feed. |
| **Mux Video** | **Free: 10 on-demand videos, 10 encoding hrs/mo, 100,000 delivery min/mo** | Encoding baseline $0.015/src-min (smart $0.035); delivery $0.00059/min after free 100k | Best DX + analytics; generous free tier for early video. Slightly pricier than Cloudflare at scale. |

**Recommendation:** **Photos → Supabase Storage + Cloudflare Images** (Supabase for upload/store in-stack; Cloudflare Images for cheap resizing/variants/CDN delivery). **Video → start on Mux free tier** (100k delivery min/mo + 10 encoding hrs is plenty for MVP and gives adaptive streaming + analytics for free), then compare against **Cloudflare Stream** ($5/1k min stored, $1/1k min delivered) as volume grows — Cloudflare is typically cheaper at scale, Mux has better DX/analytics. Avoid serving raw video from Supabase Storage (no adaptive bitrate, egress costs bite).

Sources: https://supabase.com/pricing · https://developers.cloudflare.com/images/pricing/ · https://developers.cloudflare.com/stream/pricing/ · https://www.mux.com/pricing · https://www.mux.com/docs/pricing/video

---

## 8. Places / attractions data ("suggest attractions" + check-ins)

| Source | Free tier | Cost | Notes |
|---|---|---|---|
| **Google Places API (New)** | ⚠️ **$200 universal credit retired March 2025.** Now **per-SKU free**: Essentials 10,000/mo, **Pro 5,000/mo**, Enterprise 1,000/mo (no pooled credit) | Text Search **Pro $32/1,000**; adding rating → Enterprise **$35/1,000**; reviews/atmosphere → **$40/1,000** | Best quality/coverage but expensive and billed at the **highest SKU among requested fields**. Costs escalate fast if you request ratings/photos/reviews. |
| **Foursquare Places API** | **10,000 Pro calls/mo free** + **$200/mo free usage credits**; from **June 1 2026** you also get **500 free Pro calls** under new rates | Premium fields (photos, tips, hours, ratings) **no free tier, ~$18.75/1,000** | Strong POI DB, PAYG model (Sandbox / PAYG / Enterprise). ⚠️ Legacy **V3 endpoints deprecated May 15 2026** — build on the new Places API. Good Google alternative. |
| **OpenTripMap** | RapidAPI tiers | From ~$19/mo (RapidAPI); older free key historically | ⚠️ **Effectively unmaintained** — data is frozen/stale and the project hasn't been actively updated; still responds. OK as a free-ish seed of 10M+ POIs but don't rely on freshness. |
| **OSM / Wikidata / Wikivoyage** ✅ | **Free/open** (ODbL / CC) | Self-host or query public endpoints (Overpass API, Wikidata SPARQL) | Best **free base layer** for attractions: OSM for geometry/POIs, Wikidata for structured attributes/images, Wikivoyage for editorial "things to do." No per-call cost; you host/cache. Attribution required. |

**Recommendation:** Build the **base attractions layer on OSM + Wikidata + Wikivoyage** (free, open, cacheable into Supabase/PostGIS — you already have Postgres). This is the sustainable tiny-budget foundation for "suggest attractions." Layer **Foursquare Places** (10k free Pro calls/mo + $200 credit) on top for richer/fresher POI metadata and as your **check-in** venue database (Foursquare is purpose-built for check-ins). Reserve **Google Places** for high-value queries only (autocomplete/details on demand) due to per-SKU cost and field-tier escalation. Skip OpenTripMap as a primary source (stale).

Sources: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing · https://docs.foursquare.com/developer/reference/upcoming-changes · https://foursquare.com/pricing/ · https://dev.opentripmap.org/product

---

## 9. Natural disaster / safety feeds

| Source | Access | Cost | Notes |
|---|---|---|---|
| **USGS** (already used) | Public GeoJSON feeds | Free | Earthquakes — keep. |
| **GDACS** (Global Disaster Alert & Coordination System) ✅ | **JSON/GeoJSON API + GeoRSS fallback**, no key | Free | Droughts, earthquakes, floods, tropical cyclones, tsunamis, volcanoes worldwide, with humanitarian impact levels + affected countries. API returns ~last 100 events / last 4 days. Ideal complement to USGS for the "safety" layer. |
| **US State Department travel advisories** ✅ | Official **RSS feed** | Free | Advisory level 1–4 + ISO country + risk codes + summary for ~213 countries. Parse the RSS yourself (no official REST API). |
| **UK FCDO travel advice** ✅ | **GOV.UK Content API**, no auth | Free | e.g. `https://www.gov.uk/api/content/foreign-travel-advice/thailand` → structured JSON per country. Excellent free structured advisory source. |
| **Third-party travel-risk APIs** (e.g. travelriskapi.com, travel-advisory.info) | REST, some free keys | Free–low | Aggregate GDACS + State Dept advisories with per-country risk scores; convenient but you can replicate free from primary sources. |

**Recommendation:** Compose the safety layer entirely from **free official feeds**: keep **USGS**, add **GDACS** (multi-hazard JSON/GeoRSS) for disasters, and pull travel advisories from **UK FCDO GOV.UK Content API** (cleanest structured JSON) + **US State Department RSS** (levels 1–4). Cache all via a Supabase cron into your DB and surface per-destination. No paid feed needed. Consider a third-party aggregator (travelriskapi.com) only if you want a single pre-scored endpoint and want to save integration time.

Sources: https://www.gdacs.org/ · https://new.gdacs.org/ · https://travel.state.gov/en/international-travel/travel-advisories.html · https://www.gov.uk/foreign-travel-advice · https://content-api.publishing.service.gov.uk/reference.html · https://travelriskapi.com/

---

## Summary recommendation matrix (tiny-budget MVP)

| Need | Pick for MVP (free/cheap) | Upgrade path |
|---|---|---|
| Flight status | AeroDataBox (600 units free → $5.35/mo) + AeroAPI Starter fallback | FR24 credits for live map tracking |
| Weather | Open-Meteo (free/self-host) | Open-Meteo commercial plan or OpenWeather |
| FX | Frankfurter (free, ECB, cache daily) | exchangerate.host paid if intraday needed |
| Visa data | Curate own + Passport Index datasets | sherpa° (revenue-share) |
| Cost of living | Curate own + user-submitted spend | Numbeo API ($260/mo) later |
| Bank/expense import | Enable Banking (free Restricted Prod, HU/OTP) | GoCardless BAD (verify signup) → Tink/TrueLayer at scale |
| Photos | Supabase Storage + Cloudflare Images | — |
| Video | Mux free tier (100k min/mo) | Cloudflare Stream at scale |
| Attractions | OSM + Wikidata + Wikivoyage base + Foursquare (10k free) | Google Places for premium queries |
| Safety/disaster | USGS + GDACS + FCDO API + State Dept RSS (all free) | travelriskapi.com aggregator |

**Biggest risk flag to resolve first:** GoCardless Bank Account Data availability for new signups in 2026 (conflicting sources). Confirm at `https://bankaccountdata.gocardless.com/overview/` before designing the expense-import flow; default to **Enable Banking** if unavailable.