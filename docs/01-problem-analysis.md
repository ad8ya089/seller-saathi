# 01 — Problem Analysis

Source of truth: `Snapdeal_AI_Voice_KAM_Assignment.docx` (the brief) + Sourav's email. Where they differ, the stricter one wins.

## 1. Requirements — brief vs email

| # | Requirement | Source | Our answer |
|---|---|---|---|
| R1 | Browser-based, **two-way voice**; text-only chatbot = fail | brief §3,§5; email | Hands-free VAD mic → STT → LLM → TTS; typing is a fallback only |
| R2 | Greet + understand reason for call | brief §3 | Cached greeting audio plays on "Start call"; INTAKE phase |
| R3 | Relevant follow-up questions | brief §3 | Adaptive question bank, ≤3 questions, chosen by diagnosis engine |
| R4 | Use sample data to find issues (pricing, inventory, cancellations, visibility) | brief §3 | Deterministic diagnostics over the 5 metrics + labelled synthetic SKU/cancellation detail |
| R5 | Recommend **2–3** practical actions | brief §3 | Plan capped at 3 seller actions + 1 KAM follow-up checkpoint |
| R6 | End-of-call summary (issues, recs, next steps) | brief §3 | SUMMARY phase, spoken + on-screen |
| R7 | Mock data only; **clearly mention assumptions** | brief §4,§5 | `docs/01 §6` assumption list → UI footer + one-page note |
| R8 | Demo link/runnable prototype | brief §6 | AWS EC2 HTTPS URL **and** `docker compose up` locally |
| R9 | 1–2 min screen recording of a **real** voice conversation | brief §6 | Scripted-but-live demo path, `docs/08` |
| R10 | ≤1-page note: models, STT/TTS, workflow | brief §6 | Draft in `docs/08` |
| R11 | **Don't build another Q&A bot; take ownership, drive next action** | email | Ownership loop: evidence → plan → verified confirmation → ledger → follow-up (`docs/02 §5`) |
| R12 | Explain architecture, prompts, tools, code | brief §5; email | `docs/04` decisions + interview Q&A in `docs/08` |
| R13 | Deadline | brief: **24 h**; email: **48 h** | **Plan for 24 h.** Treat 48 h as buffer, not budget |
| R14 | "Not a complex stack"; ~1–2 h expected effort | brief §7,§9 | Single Next.js service, no DB, no vector store, no agent framework. Depth is in logic, not infrastructure |

**Scoring (100):** voice & naturalness 30 · understanding queries 20 · recommendation quality 20 · AI implementation/workflow 20 · creativity/execution 10.
→ Half the marks are *voice feel* and *understanding*. Latency, turn-taking and short spoken replies beat any extra backend.

## 2. The data — what it actually says

| Metric | Last | This | Δ |
|---|---|---|---|
| Sales | ₹2,00,000 | ₹1,35,000 | −₹65,000 (−32.5%) |
| Orders | 400 | 270 | −130 (−32.5%) |
| Cancellation rate | 8% | 14% | +6 pp (×1.75) |
| ASP | ₹500 | ₹500 | 0% |
| OOS products | 5 | 18 | +13 (×3.6) |

Identity check: 400×500 = 2,00,000 and 270×500 = 1,35,000 → **Sales = gross orders × ASP.** This pins down assumption A1 (orders are gross-placed, cancellations included).

### 2.1 Sales bridge (gross view)
- Price effect = (500−500)×270 = **₹0**
- Volume effect = (270−400)×500 = **−₹65,000** → 100% of the drop is order volume. Discounting cannot be the first move.

### 2.2 Net-of-cancellation view (assumes A1)
| | Last | This |
|---|---|---|
| Net orders = orders×(1−cancel) | 368 | 232.2 |
| Net revenue | ₹1,84,000 | ₹1,16,100 |

Net drop = **−₹67,900 (−36.9%)** — worse than the headline 32.5%.

| Driver | Formula | ₹ | Share |
|---|---|---|---|
| Fewer orders | −130 × 0.92 × 500 | −59,800 | 88.1% |
| Higher cancel rate | −270 × 0.06 × 500 | −8,100 | 11.9% |
| **Total** | | **−67,900** | 100% |

**Insight:** cancellations are a *symptom + penalty*, not the main ₹ driver. The main driver is lost order volume. Cancellations still matter (buyer trust, seller scorecard — exact Snapdeal impact is **not assumed**).

### 2.3 Inventory is not one number
"OOS 5→18" is misleading without SKU weight. With the synthetic SKU table (`docs/05`): **3 of 60 listings = 47.5% of last month's orders, all three out of stock now**; they explain **123 of the 130** lost orders (94.6%). Of the 18 OOS products, 15 are low-selling tail.
→ The bot must say "3 products matter most", not "18 products are out of stock".

Recovery **ceiling** (not forecast): 123 orders × ₹500 = **₹61,500**.

### 2.4 Cancellation reasons (synthetic, `docs/05`)
Stock-unavailable cancels 8 → 21 (55% of this month's cancels). Dispatch-delay 6 → 7 (flat). Buyer-initiated 12 → 7 (fell with volume). Fulfilment/dispatch is *not* the story; stock/inventory-sync is.

## 3. Hypothesis space

| ID | Hypothesis | Prior from 5 metrics | What would confirm | What would kill it |
|---|---|---|---|---|
| H_STOCK | Key SKUs out of stock / panel stock ≠ physical stock | **High** (OOS ×3.6, cancels↑, orders↓) | SKU concentration, stock-unavailable cancels, seller confirms | Seller's OOS items are slow movers |
| H_FULFIL | Dispatch/courier failures | Low–Med (cancel↑ only) | Dispatch-delay/courier share ≥40%, seller admits delays | Reasons dominated by stock |
| H_VIS | Lost visibility (ranking/impressions) | Unknown — **funnel not in data** | Seller reports views down | Views stable |
| H_PRICE | Price uncompetitive | **Low** (ASP flat) | Competitor undercut reported | No undercut, views stable but orders down is *not* enough alone |
| H_DEMAND | Seasonality/external | Baseline | Seller cites festival/season shift | Drop concentrated in 3 SKUs |

**Not in the data (must be asked or declared unavailable, never invented):** impressions, clicks, conversion, product-level views, competitor prices, buy-box/ranking, returns/RTO, category benchmark, whether "this month" is a full or partial month.

## 4. What a good KAM does differently from a bot

1. **Looks before talking** — opens with the seller's own numbers.
2. **Separates evidence from hypothesis** — "the data shows…" vs "one possible reason is…".
3. **Asks the question that changes the plan** — not a questionnaire.
4. **Refuses the lazy answer** — no blanket discount when ASP is flat and 3 SKUs are OOS.
5. **Changes its mind** when the seller adds facts (and when the seller contradicts the data, says so politely and trusts the data).
6. **Owns the follow-through** — plan with owner/due/metric, verified confirmation, review date, ledger.

## 5. Snapdeal context to bake into tone & advice
- Value commerce: FY26 (AceVector MD&A, from earlier research pass) — lifestyle ≈ 95% of NMV, ~84% of delivered units < ₹599, ~82% from non-metro customers. → Seller persona is small lifestyle seller at ~₹500 ASP; advice = availability, in-stock hero SKUs, value positioning; **not** premium branding or deep discounts.
- Snapdeal publishes seller APIs (inventory, price, order, listing; sandbox/prod credentials needed). → Our tools mirror those capabilities as **simulated** calls. We do not claim integration.
- Sellers: MSME, many non-metro, Hindi/Hinglish-comfortable. → English-India default, Hindi/Hinglish toggle (stretch P7), plain words, short sentences, "aap"-level respect.

## 6. Assumptions (print these in UI footer + note)

| ID | Assumption |
|---|---|
| A1 | Sales and Orders are **gross placed** (cancelled orders included); Sales = Orders × ASP |
| A2 | "This month" is a comparable period to "Last month" (full-month or same-day-count); brief doesn't say |
| A3 | Seller is fictional: "Sharma Fashion Hub", women's ethnic wear, Surat — 60 active listings |
| A4 | All listings priced at ASP ₹500 for impact maths |
| A5 | SKU-level orders, stock, and cancellation reasons are **synthetic**, built to sum exactly to the brief's totals |
| A6 | Impressions/clicks/conversion are **unavailable**; the bot asks, never invents |
| A7 | Diagnostic thresholds (sales −15%, cancel +3pp, OOS ×2) are demo rules, not Snapdeal policy |
| A8 | "Recoverable orders/₹" is a **ceiling**, not a forecast; no growth promises |
| A9 | No Snapdeal penalty/ranking rules are asserted; bot says "check your seller panel for exact impact" |
| A10 | "Saved plan" = demo ledger only; **nothing** is changed in any Snapdeal system |

## 7. Failure modes of a naive solution (what we avoid)
- Generic advice ("improve visibility, offer discounts") → fails R3/R4/Quality 20.
- Long monologues over TTS → fails Voice 30.
- LLM computing numbers → hallucinated metrics. Numbers come from code only.
- Claiming actions were executed → trust failure. Only tool results may be claimed.
- Over-engineering (agents, DB, RAG) → burns 24 h, adds nothing to marks.
