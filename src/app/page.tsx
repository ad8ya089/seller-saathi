import type { ReactNode } from 'react';
import { VoiceConsole } from '@/components/VoiceConsole';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string | string[] }>;
}): Promise<ReactNode> {
  const { debug } = await searchParams;
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-5 py-10 sm:py-14">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-700">
          Voice echo preview · Under development
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          SellerSaathi
        </h1>
        <p className="text-lg text-stone-700">Snapdeal Virtual KAM</p>
        <p className="max-w-xl text-sm leading-relaxed text-stone-600">
          Speak a short message and hear it echoed back. This preview uses AI
          speech recognition and voice synthesis; seller diagnosis is coming
          later.
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
