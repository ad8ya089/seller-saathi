import type { ReactNode } from 'react';
import { SellerDashboard } from '@/components/SellerDashboard';
import { getRuntime } from '@/lib/server/runtime';
import { dashboardReference } from '@/lib/server/dashboard-reference';
import type { DashboardReference } from '@/lib/client/dashboard-contracts';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string | string[] }>;
}): Promise<ReactNode> {
  const { debug } = await searchParams;
  let reference: DashboardReference | null = null;
  let hinglishEnabled = false;
  // Warm once on the first dynamic page request, before the Call gesture.
  // This avoids provider work during the production build or missing-key boot.
  try {
    const runtime = getRuntime();
    hinglishEnabled = runtime.config.hinglishEnabled;
    runtime.warmGreeting();
    reference = dashboardReference(await runtime.data(), runtime.config);
  } catch {
    /* Health and call routes report configuration errors. */
  }
  return (
    <SellerDashboard
      reference={reference}
      debug={debug === '1'}
      hinglishEnabled={hinglishEnabled}
    />
  );
}
