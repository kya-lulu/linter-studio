import Header from '@/components/Header';
import { artworks } from '@/lib/artworks';
import ArchiveList from '@/components/ArchiveList';

export const metadata = {
  title: 'Archive · linter.studio',
};

export default function ArchivePage() {
  const lastNameKey = (a: typeof artworks[number]) => {
    const tokens = (a.artist?.name || '').trim().split(/\s+/);
    return tokens[tokens.length - 1]?.toLowerCase() || '';
  };
  const sorted = [...artworks].sort((a, b) => {
    if (!!a.image !== !!b.image) return a.image ? -1 : 1;
    return lastNameKey(a).localeCompare(lastNameKey(b));
  });

  return (
    <main className="min-h-screen bg-canvas pb-32">
      <Header active="archive" />
      <ArchiveList artworks={sorted} />
      <footer className="mt-24 px-6 lg:px-12">
        <div className="mx-auto max-w-[1800px] pt-8 border-t border-rule">
          <p className="text-[11px] tracking-wide text-muted">
            © {new Date().getFullYear()} linter.studio · Complete index of works seen.
          </p>
        </div>
      </footer>
    </main>
  );
}

