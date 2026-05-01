import Link from 'next/link';
import { notFound } from 'next/navigation';
import ArtworkDetail from '@/components/ArtworkDetail';
import { getArtworkBySlug, getAllSlugs } from '@/lib/artworks';

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artwork = getArtworkBySlug(slug);
  if (!artwork) return {};
  return {
    title: `${artwork.title} — ${artwork.artist.name} · linter.studio`,
    description: artwork.description.slice(0, 160),
  };
}

export default async function WorkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artwork = getArtworkBySlug(slug);
  if (!artwork) notFound();

  return (
    <main className="min-h-screen bg-canvas">
      <header className="px-6 lg:px-12 pt-8 pb-10">
        <div className="mx-auto max-w-[1400px]">
          <Link
            href="/"
            className="text-[13px] text-muted hover:text-ink transition-colors inline-flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25">
              <path d="M9 3 L4 7 L9 11" />
            </svg>
            Back to wall
          </Link>
        </div>
      </header>

      <div className="px-6 lg:px-16 pb-24">
        <div className="mx-auto max-w-[1400px]">
          <ArtworkDetail artwork={artwork} />
        </div>
      </div>
    </main>
  );
}
