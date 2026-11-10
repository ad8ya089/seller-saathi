# 08 — Submission Pack

Deliverables (brief §6): **(1)** working demo link or runnable prototype · **(2)** 1–2 min screen recording of a real voice conversation · **(3)** ≤1-page note on models, STT/TTS, workflow. Email adds: be ready to explain solution, logic, decisions.

## 1. Submission email (draft)
> Subject: Snapdeal AI First Intern — Mini Virtual KAM (voice) submission
> Hi Sourav, Please find my submission:
> • Live demo (HTTPS, mic needed): https://‹domain›  — click "Call Virtual KAM". Best in Chrome; headphones recommended.
> • 90-second screen recording: ‹link›
> • One-page note: attached / ‹link›
> • Code: https://github.com/‹you›/snapdeal-virtual-kam (runs locally with `docker compose up`)
> What it does differently: it doesn't just answer — it reads the seller's numbers, finds that three out-of-stock best-sellers explain ~95% of the lost orders, asks only what changes the plan, and saves a 3-action recovery plan with owners, due dates and a 7-day review once the seller says yes.
> All data is mock/synthetic; nothing connects to Snapdeal systems. Assumptions are listed in the note.
> Thanks, ‹Name›

## 2. One-page note (≤1 page — fill ‹measured› after P5/P6)

**Snapdeal Mini Virtual KAM — approach note** · ‹Name›

**Goal.** A voice-first AI Key Account Manager that, when a seller says "my sales dropped", investigates their numbers, asks the few questions that matter, recommends 2–3 actions, and *owns the follow-through* (confirmed plan, owners, dates, review).

**Workflow.** Seller speaks → browser VAD detects end of turn → Sarvam Saaras speech-to-text → Gemini 3.5 Flash-Lite agent (function calling) → deterministic diagnostics + tools → reply streamed sentence-by-sentence → Sarvam Bulbul text-to-speech → audio plays while the next sentence is generated. Seller can interrupt (barge-in).

**Models & voice tech.** STT: Sarvam Saaras (Indian English/Hindi/code-mix). LLM: Gemini 3.5 Flash-Lite (fallback Gemini 3.6 Flash). TTS: Sarvam Bulbul v3. Browser: Silero VAD (vad-web), Web Audio. App: Next.js/TypeScript on AWS EC2 (Mumbai), Docker + Caddy HTTPS.

**Why it's not "just a bot".** Business logic is code, not prompt: the engine computes the sales bridge (all −₹65,000 is order volume; price effect ₹0), ranks hypotheses (stock, fulfilment, visibility, price, demand), picks the next question, and restricts the plan to an action catalog. The LLM only talks and chooses among allowed options. Saving a plan requires the seller's explicit spoken yes, verified server-side. The agent never claims to change Snapdeal systems.

**Key finding on sample data.** Orders fell 32.5% with ASP flat → not a pricing problem. Cancellations 8%→14%; OOS 5→18. With synthetic SKU detail, 3 of 60 listings (≈47% of last month's orders) are out of stock and account for ~123 of 130 lost orders. Cancellation increase ≈12% of the ₹ drop; volume ≈88%.

**Assumptions (mock).** Orders/sales are gross placed; seller "Sharma Fashion Hub" (women's ethnic wear, 60 listings, ₹500 ASP); SKU-level orders/stock and cancellation reasons are synthetic and sum to the brief's totals; impressions/clicks/conversion are unavailable and never invented; thresholds are demo rules; recovery figures are ceilings, not forecasts; "saved plan" is a demo ledger only.

**Measured.** First audio after end of speech: p50 ‹x.x s›, p95 ‹x.x s› (public URL, India). Persona evals ‹27/30›. Cost ≈ ₹‹6–7› per 4-minute call.

**Limits & next.** Funnel data (impressions/conversion) and real inventory/price actions via Snapdeal seller APIs would be the next integration; streaming STT/TTS for lower latency; Day-7 follow-up call; Hindi-first mode.

## 3. 90-second recording script (S1 path; record from public URL)

Prep: Chrome, quiet room, headphones **or** laptop speakers with good AEC (test), system audio capture on (OBS/QuickTime+BlackHole), hide bookmarks, `?debug=1` off for the main take, 125% zoom.

| t | Seller says (natural, short) | Screen shows |
|---|---|---|
| 0:00 | — click **Call Virtual KAM** | orb "speaking": greeting |
| 0:08 | "My sales have dropped a lot this month. I don't understand why — can you help me?" | transcript; tool chips; Snapshot tab fills |
| 0:22 | (KAM states numbers + asks about out-of-stock best-sellers) "Yes, the cotton kurti set and the saree. Supplier is late." | Diagnosis: STOCK → high, facts chip |
| 0:40 | (KAM asks ETA) "Around ten days." | questions used 2/3 |
| 0:50 | (KAM speaks the 3-action plan) "Yes, please save it." | Plan card → "Saved to demo ledger", follow-up date |
| 1:15 | (KAM summary) — let it finish | ledger entry visible |
| 1:25 | End call | — |

Take 3–5 takes; keep the one where first-audio feels snappy. Add a 3-line caption overlay at the end: *Mock data · Sarvam STT/TTS · Gemini · Next.js*. If a take has an STT glitch, that's fine only if the bot recovers gracefully — otherwise retake.

## 4. Interview prep — expected questions & crisp answers

1. **Why cascaded not speech-to-speech?** Control: transcript, tool gating, guards, swap-ability, Indic STT/TTS quality; S2S wins latency, loses control. Hybrid path exists.
2. **How do you avoid hallucinating numbers?** Numbers come only from tools backed by a deterministic engine; prompt forbids computing; style lint + persona evals check for leaked codes/figures.
3. **What does "ownership" mean in your build?** Evidence → ranked diagnosis → 2–3 catalog actions with owner/due/metric → verified spoken confirmation → ledger + day-7 checkpoint (+ follow-up call in stretch).
4. **Why only 3 questions?** Sellers are time-poor; each question must change the plan; engine stops when margin ≥3.
5. **How does it handle the seller contradicting the data?** States what data shows once, asks to check; data keeps its weight (scored), seller fact adjusts it (S2 test).
6. **How do you make voice feel natural?** VAD end-of-turn, sentence-streamed TTS, short replies, barge-in, cached greeting/fillers, spoken-number rules. Latency budget and measurement.
7. **What's your latency and where is it spent?** ‹fill from bench›: VAD hangover, STT, LLM first sentence, TTS first sentence; levers.
8. **Prompt injection / unsafe commit?** Treat user text as data; commit needs plan from earlier turn + verbatim quote in last utterance + affirmative check; S10 test.
9. **Cost per call and how would you scale?** ≈₹6–7/call; scale via streaming STT/TTS, Redis sessions, batch/caching for LLM, per-seller context cache.
10. **Production integration?** Replace mock tools with Snapdeal seller-API-backed ones (inventory, price, orders); auth by seller ID; telephony (SIP/Exotel) in front of the same pipeline; outbound proactive calls when signals trigger.
11. **Why not RAG?** Problem is structured data + small playbook; RAG adds retrieval error with no benefit. Playbook knowledge lives in the action catalog.
12. **Indian languages?** Saaras/Bulbul support code-mix; Hinglish mode (P7); same engine.
13. **What would you do with real data?** Add product-level impressions/conversion to move from "ask" to "see" (visibility vs conversion decision tree), calibrate thresholds against category benchmarks, backtest recommendations.
14. **What did AI write vs you?** Codex scaffolding/adapters/UI; I designed diagnosis rules, question order, action catalog, prompts, and tuned voice.
15. **Biggest risk?** Provider/model drift and latency; mitigated by env-configured models, smoke tests, fallbacks, and a recorded demo.

## 5. "What I'd do next" (one slide worth)
Real seller API tools · proactive outbound KAM call on signal triggers · day-7 follow-up and weekly review loop · multilingual (Hindi, Bengali, Gujarati) · category benchmarks · human-handoff with plan attached · evaluation dashboard from call logs.

## 6. Pre-submit checklist
- [ ] Public URL works from a phone on mobile data.
- [ ] Recording ≤2:00, real audio both sides, no keys/tokens visible.
- [ ] Note ≤1 page, assumptions listed, measured numbers filled.
- [ ] Repo: README with one-command run, `.env.example`, no secrets in history (`git log -p | grep -i key`).
- [ ] Budget alerts on; Sarvam credit balance > ₹300; Gemini billing enabled.
- [ ] Teardown date noted.
