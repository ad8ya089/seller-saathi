import type { ReactNode } from 'react';
import { ASSUMPTIONS } from '@/lib/content/assumptions';
export function AssumptionsFooter(): ReactNode {
  return (
    <footer className="mt-8 border-t border-slate-200 pt-6 pb-8 text-xs text-slate-600">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>Demo workspace. Nothing is changed in Snapdeal systems.</p>
        <span>Built around evidence. Agreed with the seller.</span>
      </div>
      <details className="mt-4 rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 font-medium text-slate-700">
          Assumptions &amp; data notes · A1–A10
        </summary>
        <ol className="grid gap-x-8 gap-y-4 border-t border-slate-100 p-4 leading-6 sm:grid-cols-2">
          {ASSUMPTIONS.map((item) => (
            <li key={item.id} className="flex gap-3">
              <span className="shrink-0 font-semibold text-slate-700">
                {item.id}
              </span>
              <span>{item.text}</span>
            </li>
          ))}
        </ol>
      </details>
    </footer>
  );
}
