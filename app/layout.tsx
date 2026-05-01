import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'linter.studio',
  description: 'A personal collection of works seen.',
  metadataBase: new URL('https://linter.studio'),
  openGraph: {
    title: 'linter.studio',
    description: 'A personal collection of works seen.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        {children}
        {modal}
      </body>
    </html>
  );
}
