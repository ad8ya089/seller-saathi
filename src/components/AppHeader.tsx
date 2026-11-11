import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Language } from '@/lib/voice/language';
export function AppHeader({
  debug,
  language = 'en-IN',
  onLanguage,
  languageLocked = false,
  hinglishEnabled = false,
}: {
  debug: boolean;
  language?: Language;
  onLanguage?: (language: Language) => void;
  languageLocked?: boolean;
  hinglishEnabled?: boolean;
}): ReactNode {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-3 px-4 py-4 sm:px-6 lg:gap-x-5 lg:px-8 lg:py-5">
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-700 text-xl font-bold tracking-tight text-white sm:h-10 sm:w-10"
          >
            S<span className="mb-2 text-red-200">.</span>
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">
              SellerSaathi
            </h1>
            <p className="mt-0.5 text-[10px] text-slate-500 sm:text-xs">
              Snapdeal Virtual KAM
            </p>
          </div>
        </div>
        <span className="badge-neutral order-3 max-w-full lg:order-2">
          Mock data · not connected to Snapdeal
        </span>
        <div className="order-2 flex items-center gap-1.5 lg:order-3 lg:gap-3">
          <div
            role="group"
            aria-label="Call language"
            className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs"
          >
            <button
              type="button"
              aria-pressed={language === 'en-IN'}
              disabled={languageLocked}
              onClick={(): void => {
                onLanguage?.('en-IN');
              }}
              className={`rounded-md px-2 py-2 lg:px-3 ${language === 'en-IN' ? 'bg-white font-semibold text-slate-800 shadow-sm' : 'text-slate-600'}`}
            >
              English
            </button>
            <div className="group relative">
              <button
                type="button"
                aria-disabled={!hinglishEnabled || languageLocked}
                disabled={!hinglishEnabled || languageLocked}
                aria-pressed={language === 'hi-IN'}
                onClick={(): void => {
                  onLanguage?.('hi-IN');
                }}
                aria-describedby="hindi-hint"
                className={`rounded-md px-2 py-2 lg:px-3 ${language === 'hi-IN' ? 'bg-white font-semibold text-slate-800 shadow-sm' : 'text-slate-600'} disabled:cursor-not-allowed`}
              >
                Hindi
              </button>
              <span
                id="hindi-hint"
                role="tooltip"
                className="pointer-events-none absolute top-full right-0 z-20 mt-2 hidden w-48 rounded-lg bg-slate-900 p-3 text-xs leading-5 text-white shadow-lg group-hover:block group-focus-within:block"
              >
                {hinglishEnabled
                  ? 'Roman-script Hinglish mixes Hindi with English business words. Start a fresh call to change language.'
                  : 'Hindi/Hinglish is disabled until its provider profile passes verification.'}
              </span>
            </div>
          </div>
          <Link
            href={debug ? '/' : '/?debug=1'}
            scroll={false}
            className="rounded-lg px-2 py-2 text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-4"
          >
            {debug ? 'Hide debug' : 'Debug'}
          </Link>
        </div>
      </div>
    </header>
  );
}
