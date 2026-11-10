import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'SellerSaathi — Snapdeal Virtual KAM',
  description:
    'A voice-first seller recovery demo. Under development. Mock data only.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
