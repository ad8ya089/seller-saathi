export const ASSUMPTIONS = [
  {
    id: 'A1',
    text: 'Sales and Orders are gross placed (cancelled orders included); Sales = Orders × ASP',
  },
  {
    id: 'A2',
    text: '"This month" is a comparable period to "Last month" (full-month or same-day-count); brief doesn’t say',
  },
  {
    id: 'A3',
    text: 'Seller is fictional: "Sharma Fashion Hub", women’s ethnic wear, Surat — 60 active listings',
  },
  { id: 'A4', text: 'All listings priced at ASP ₹500 for impact maths' },
  {
    id: 'A5',
    text: 'SKU-level orders, stock, and cancellation reasons are synthetic, built to sum exactly to the brief’s totals',
  },
  {
    id: 'A6',
    text: 'Impressions/clicks/conversion are unavailable; the bot asks, never invents',
  },
  {
    id: 'A7',
    text: 'Diagnostic thresholds (sales −15%, cancel +3pp, OOS ×2) are demo rules, not Snapdeal policy',
  },
  {
    id: 'A8',
    text: '"Recoverable orders/₹" is a ceiling, not a forecast; no growth promises',
  },
  {
    id: 'A9',
    text: 'No Snapdeal penalty/ranking rules are asserted; bot says "check your seller panel for exact impact"',
  },
  {
    id: 'A10',
    text: '"Saved plan" = demo ledger only; nothing is changed in any Snapdeal system',
  },
] as const;
