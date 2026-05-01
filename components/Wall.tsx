'use client';

import { useMemo, useState } from 'react';
import Masonry from 'react-masonry-css';
import ArtworkTile from './ArtworkTile';
import type { Artwork } from '@/lib/types';

const breakpointColumns = {
  default: 4,
  1536: 4,
  1024: 3,
  640: 2,
  0: 1,
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Wall({
  artworks,
  museums,
}: {
  artworks: Artwork[];
  museums: string[];
}) {
  const [shuffled, setShuffled] = useState(false);
  const [seed, setSeed] = useState(0);
  const [museum, setMuseum] = useState<string | null>(null);

  const displayed = useMemo(() => {
    let list = museum ? artworks.filter((a) => a.seenAt === museum) : artworks;
    if (shuffled) {
      void seed;
      list = shuffle(list);
    }
    return list;
  }, [artworks, museum, shuffled, seed]);

  return (
    <div className="mx-auto max-w-[1800px] px-6 lg:px-12">
      <div className="mb-10 flex items-center gap-6 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setMuseum(null)}
          className={`shrink-0 text-[13px] tracking-wide transition-colors ${
            museum === null ? 'text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          All works
        </button>
        {museums.length > 1 && <span className="text-rule shrink-0">·</span>}
        {museums.map((m) => (
          <button
            key={m}
            onClick={() => setMuseum(m)}
            className={`shrink-0 text-[13px] tracking-wide transition-colors whitespace-nowrap ${
              museum === m ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {m.split(',')[0]}
          </button>
        ))}
        <div className="ml-auto shrink-0 flex items-center">
          <button
            onClick={() => {
              if (shuffled) {
                setSeed((s) => s + 1);
              } else {
                setShuffled(true);
              }
            }}
            className={`text-[13px] tracking-wide transition-colors ${
              shuffled ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
            aria-pressed={shuffled}
          >
            Shuffle
          </button>
          {shuffled && (
            <button
              onClick={() => setShuffled(false)}
              className="ml-4 text-[13px] tracking-wide text-muted hover:text-ink transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <Masonry
        breakpointCols={breakpointColumns}
        className="masonry-grid"
        columnClassName="masonry-column"
      >
        {displayed.map((artwork) => (
          <ArtworkTile key={artwork.slug} artwork={artwork} />
        ))}
      </Masonry>
    </div>
  );
}
