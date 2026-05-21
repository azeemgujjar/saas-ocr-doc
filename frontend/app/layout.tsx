import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IDP — Intelligent Document Processing',
  description: 'Multi-tenant document processing SaaS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
