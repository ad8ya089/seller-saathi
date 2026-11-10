import type { ReactNode } from 'react';

export default function Home(): ReactNode {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-red-700">
        Under development
      </p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        SellerSaathi
      </h1>
      <p className="text-xl text-stone-700">Snapdeal Virtual KAM</p>
      <p className="max-w-xl leading-relaxed text-stone-600">
        A voice-first assistant to help sellers understand sales changes and
        plan their next steps. The voice experience is coming in a later phase.
      </p>
      <footer className="border-t border-stone-300 pt-6 text-sm text-stone-600">
        Demo with mock and synthetic data. Not connected to Snapdeal systems.
      </footer>
    </main>
  );
}
