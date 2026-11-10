import type { ReactNode } from 'react';
import { VoiceConsole } from '@/components/VoiceConsole';
import { getRuntime } from '@/lib/server/runtime';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string | string[] }>;
}): Promise<ReactNode> {
  const { debug } = await searchParams;
  // Warm once on the first dynamic page request, before the Call gesture.
  // This avoids provider work during the production build or missing-key boot.
  try {
    getRuntime().warmGreeting();
  } catch {
    /* Health and call routes report configuration errors. */
  }
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-5 py-10 sm:py-14">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-700">
          Seller recovery demo
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          SellerSaathi
        </h1>
        <p className="text-lg text-stone-700">Snapdeal Virtual KAM</p>
        <p className="max-w-xl text-sm leading-relaxed text-stone-600">
          Talk through falling sales with your Virtual Account Manager. Review
          the evidence, agree on practical next steps and save a plan in this
          demo workspace.
        </p>
        <p className="inline-block rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600">
          Mock data — not connected to Snapdeal
        </p>
      </header>
      <VoiceConsole debug={debug === '1'} />
      <footer className="border-t border-stone-300 pt-6 text-sm text-stone-600">
        Nothing is changed in Snapdeal systems.{' '}
        <a
          href={debug === '1' ? '/' : '/?debug=1'}
          className="ml-1 underline underline-offset-2"
        >
          {debug === '1' ? 'Hide timing debug' : 'Show timing debug'}
        </a>
      </footer>
    </main>
  );
}
