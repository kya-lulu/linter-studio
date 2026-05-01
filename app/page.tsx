import Wall from '@/components/Wall';
import Header from '@/components/Header';
import { artworks, getMuseums } from '@/lib/artworks';

export default function Home() {
  // Wall only shows entries with images
  const withImages = artworks.filter((a) => a.image);
  const museums = Array.from(new Set(withImages.map((a) => a.seenAt))).sort();

  return (
    <main className="min-h-screen bg-canvas pb-32">
      <Header active="wall" />
      <Wall artworks={withImages} museums={museums} />
      <footer className="mt-24 px-6 lg:px-12">
        <div className="mx-auto max-w-[1800px] pt-8 border-t border-rule">
          <p className="text-[11px] tracking-wide text-muted">
            © {new Date().getFullYear()} linter.studio · Images of artworks remain
            the property of their respective artists, estates, and institutions.
          </p>
        </div>
      </footer>
    </main>
  );
}

