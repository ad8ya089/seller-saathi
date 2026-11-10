# P1 implementation decisions

The expanded P1 request takes precedence over the earlier P1 block in `prompt.md`.

- Order concentration uses the **gross placed-order decline**, 123 / 130. Net-of-cancellation orders are a separate calculation using the documented cancellation rates, not rounded cancellation counts.
- Data loading and ledger filesystem operations live in `src/lib/server/`; all domain modules remain pure. CLI entry points use Node's `react-server` condition to load server-only infrastructure.
- Health retains the boolean `providers` contract in docs/03. A missing credential means that provider's configured status is false; it is not an outbound connectivity test.
- Later-phase commands print the owning phase and exit non-zero until implemented. P1 contains no provider adapters, sessions, voice assets, tool guards or deployment artifacts.
- Stock denial prioritizes the documented dispatch question before ETA. A seller unable to restock is asked Q_CAPACITY before readiness can short-circuit investigation, within the same three-question budget. Unknown answers are recorded but never treated as yes.
- Action weights and feasibility factors are demo policy tables because docs/02 specifies their formula but no numeric values. Eligible actions use stable catalog order to break ties. If fewer than two seller actions are eligible, planning returns a typed error instead of fabricating an action. Follow-up is a separate Virtual KAM checkpoint.
- Calendar dates use the injected date's UTC calendar day and UTC offsets, so plans are independent of the machine timezone. The future caller must pass the intended business day.
- An unavailable restock ETA is represented by an absent fact. Restock impossibility is recorded through `can_restock_partial=no`; no undocumented fact IDs are introduced.
- Synthetic flags are added to the SKU, cancellation and follow-up envelopes. Headline seller metrics and the seller's documented synthetic-source list are preserved.
- P1 persists only already-committed records through an infrastructure contract. Confirmation authorization and phase guards belong to P3; P1 exposes no public ledger write route.
- The initial application uses the local system font stack. It needs no external font request at build or runtime.
- `npm start` copies static assets and fixture data to the standalone output before loading its generated server, following the installed Next.js output guide. `agentRules: false` preserves the supplied `AGENTS.md` during development.
- TypeScript 6.0.3 is the latest stable version supported by the installed TypeScript ESLint parser. ESLint 9.39.5 is the latest compatible release for Next.js 16.4.6's bundled React/import/accessibility plugins; ESLint 10 has incompatible peer ranges. npm marks ESLint 9 as unsupported. Follow upstream compatibility updates before upgrading it.

Sarvam's language field, model/mode combinations and Gemini thinking parameters remain unverified until the P2/P3 smoke scripts. Model defaults follow the design pack and are configurable; no live-provider claim is made in P1.
