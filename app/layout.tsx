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
    url: 'https://linter.studio',
    siteName: 'linter.studio',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'linter.studio — A personal collection of works seen.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'linter.studio',
    description: 'A personal collection of works seen.',
    images: ['/og-image.jpg'],
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

