import Link from 'next/link';

export default function Header({ active }: { active: 'wall' | 'archive' }) {
  return (
    <header className="px-6 lg:px-12 pt-10 pb-12 lg:pt-14 lg:pb-16">
      <div className="mx-auto max-w-[1800px] flex items-baseline justify-between gap-6">
        <div>
          <h1 className="text-[15px] font-medium tracking-tight text-ink lowercase">
            <Link href="/" className="hover:opacity-60 transition-opacity">
              linter.studio
            </Link>
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            A personal collection of works seen.
          </p>
        </div>
        <nav className="flex items-center gap-6 text-[13px] tracking-wide">
          <Link
            href="/"
            className={`transition-colors ${active === 'wall' ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            Wall
          </Link>
          <Link
            href="/archive"
            className={`transition-colors ${active === 'archive' ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            Archive
          </Link>
        </nav>
      </div>
    </header>
  );
}

