import type { ReactNode } from 'react';
import type {
  DashboardSnapshot,
  DashboardReference,
} from '@/lib/client/dashboard-contracts';
import {
  currency,
  number,
  percent,
  percentagePoints,
  signedNumber,
} from '@/lib/client/format';
import { effectWidth, referenceFor } from '@/lib/client/dashboard-view';

export function SnapshotPanel({
  snapshot,
  reference,
  loading = false,
  error = null,
}: {
  snapshot: DashboardSnapshot | null;
  reference: DashboardReference | null;
  loading?: boolean;
  error?: string | null;
}): ReactNode {
  if (!snapshot)
    return (
      <div className="panel-empty">
        <span className="eyebrow">Business snapshot</span>
        <h2 className="mt-3 text-xl font-semibold">
          {loading
            ? 'Opening your seller session…'
            : 'Your numbers, in context'}
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
          {error ??
            'Start a call or send a message to load the seller’s business snapshot. Your KAM will use these figures to investigate the sales dip.'}
        </p>
        <p className="mt-6 text-xs text-slate-500">
          Assignment figures · fictional demo seller
        </p>
      </div>
    );
  const { seller, bridge } = snapshot;
  const { last, this: current } = seller.periods;
  const view = referenceFor(snapshot, reference);
  const change = (value: number | null | undefined): string =>
    value === null || value === undefined
      ? 'Not available'
      : `${signedNumber(value)}%`;
  const rows = [
    {
      label: 'Orders',
      last: number(last.orders),
      current: number(current.orders),
      delta: `${signedNumber(bridge.orderDelta)} orders`,
      detail: change(view?.deltas.orders),
    },
    {
      label: 'Gross sales',
      last: currency(last.sales),
      current: currency(current.sales),
      delta: currency(bridge.salesDelta),
      detail: change(bridge.pct),
    },
    {
      label: 'Average selling price',
      last: currency(last.asp),
      current: currency(current.asp),
      delta: change(view?.deltas.asp),
      detail: 'Price change',
    },
    {
      label: 'Out-of-stock SKUs',
      last: number(last.oosProducts),
      current: number(current.oosProducts),
      delta: view ? `${signedNumber(view.deltas.oos)} SKUs` : 'Not available',
      detail: 'Listing count',
    },
    {
      label: 'Cancellation rate',
      last: percent(last.cancelRate),
      current: percent(current.cancelRate),
      delta: percentagePoints(view?.deltas.cancelPoints),
      detail: 'Percentage points',
    },
  ];
  const effects = [
    { label: 'Volume / order effect', value: bridge.volumeEffect },
    { label: 'Price effect', value: bridge.priceEffect },
  ];
  return (
    <div className="space-y-6 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Business snapshot</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            {seller.name}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {seller.city} · {seller.category}
          </p>
        </div>
        <span className="badge-neutral">Demo data</span>
      </header>
      <div className="rounded-xl border border-red-100 bg-red-50/60 px-5 py-4">
        <p className="text-sm text-slate-600">
          Gross sales · {current.label.toLowerCase()}
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-3xl font-semibold tracking-tight text-slate-950">
            {currency(current.sales)}
          </p>
          <span className="text-sm font-semibold text-red-800">
            {change(bridge.pct)}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          Compared with {currency(last.sales)} in {last.label.toLowerCase()}
        </p>
      </div>
      <table className="w-full table-fixed text-left text-xs sm:text-sm">
        <caption className="mb-3 text-left text-sm font-medium text-slate-700">
          {last.label} versus {current.label.toLowerCase()}
        </caption>
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th scope="col" className="w-[29%] pb-3 pr-2 font-medium">
              Metric
            </th>
            <th scope="col" className="w-[23%] pb-3 pr-1 font-medium">
              Last month
            </th>
            <th scope="col" className="w-[23%] pb-3 pr-1 font-medium">
              This month
            </th>
            <th scope="col" className="w-[25%] pb-3 font-medium">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-slate-100 align-top">
              <th
                scope="row"
                className="py-3 pr-2 font-medium leading-5 text-slate-600"
              >
                {row.label}
              </th>
              <td className="py-3 pr-1 tabular-nums text-slate-600">
                {row.last}
              </td>
              <td className="py-3 pr-1 font-semibold tabular-nums text-slate-900">
                {row.current}
              </td>
              <td className="py-3 tabular-nums">
                <span className="block font-medium text-slate-800">
                  {row.delta}
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                  {row.detail}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <figure
        aria-labelledby="sales-bridge-title"
        className="rounded-xl border border-slate-200 p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="sales-bridge-title" className="text-sm font-semibold">
            What changed gross sales?
          </h3>
          <span className="text-sm font-semibold tabular-nums text-red-800">
            {currency(bridge.salesDelta)}
          </span>
        </div>
        <div className="mt-4 space-y-4">
          {effects.map((effect) => (
            <div key={effect.label}>
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-slate-600">{effect.label}</span>
                <span className="font-medium tabular-nums">
                  {currency(effect.value)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="relative mt-2 h-2 rounded-full bg-slate-100"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-red-600"
                  style={{
                    width: `${String(
                      effectWidth(
                        effect.value,
                        effects.map((item) => item.value),
                      ),
                    )}%`,
                  }}
                />
                {effect.value === 0 && (
                  <span className="absolute inset-y-0 left-0 w-px bg-slate-500" />
                )}
              </div>
            </div>
          ))}
        </div>
        <figcaption className="mt-4 text-xs leading-5 text-slate-500">
          This bridge separates the effect of order volume from the effect of
          selling prices. These are gross placed sales, including cancelled
          orders.
        </figcaption>
      </figure>
      <p className="text-xs leading-5 text-slate-500">
        Headline figures come from the assignment. SKU stock and cancellation
        reasons used in the diagnosis are synthetic. Views, conversion and
        competitor prices are not available.
      </p>
    </div>
  );
}
