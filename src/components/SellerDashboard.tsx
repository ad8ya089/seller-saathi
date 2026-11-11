'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useVoiceCall } from '@/lib/client/useVoiceCall';
import type { DashboardReference } from '@/lib/client/dashboard-contracts';
import { VoiceConsole } from '@/components/VoiceConsole';
import { AppHeader } from '@/components/AppHeader';
import { DashboardTabs } from '@/components/DashboardTabs';
import type { DashboardTab } from '@/components/DashboardTabs';
import { AssumptionsFooter } from '@/components/AssumptionsFooter';
import { DebugOverlay } from '@/components/DebugOverlay';
import { number } from '@/lib/client/format';
export function SellerDashboard({
  reference,
  debug = false,
  hinglishEnabled = false,
}: {
  reference: DashboardReference | null;
  debug?: boolean;
  hinglishEnabled?: boolean;
}): ReactNode {
  const voice = useVoiceCall();
  const [tab, setTab] = useState<DashboardTab>('snapshot');
  return (
    <>
      <a href="#workspace" className="skip-link">
        Skip to workspace
      </a>
      <AppHeader
        debug={debug}
        language={voice.language}
        onLanguage={voice.setLanguage}
        languageLocked={voice.active || voice.initializing}
        hinglishEnabled={hinglishEnabled}
      />
      <main
        id="workspace"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1320px] px-4 pt-7 sm:px-6 lg:px-8"
      >
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Seller recovery workspace</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              A clearer path forward.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Talk through the sales dip. Check the evidence. Agree on your next
              steps.
            </p>
          </div>
          {voice.snapshot && (
            <p className="max-w-full text-xs text-slate-600">
              {number(voice.snapshot.seller.activeListings)} active listings ·{' '}
              {voice.snapshot.seller.city}
            </p>
          )}
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Temporary demo ledger: saved plans may disappear when this demo
          restarts. Nothing is sent to Snapdeal.
        </p>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.35fr)]">
          <VoiceConsole
            voice={voice}
            onReviewPlan={(): void => {
              setTab('plan');
            }}
          />
          <DashboardTabs
            state={voice}
            reference={reference}
            onConfirm={voice.confirmPlan}
            onFollowup={async (planId): Promise<void> => {
              setTab('plan');
              await voice.startCall({
                lang: voice.language,
                mode: 'followup',
                planId,
                followupRunId: crypto.randomUUID(),
              });
            }}
            selected={tab}
            onSelect={setTab}
          />
        </div>
        {debug && <DebugOverlay state={voice} />}
        <AssumptionsFooter />
      </main>
    </>
  );
}
