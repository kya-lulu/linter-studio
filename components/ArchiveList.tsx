'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Artwork } from '@/lib/types';

export default function ArchiveList({ artworks }: { artworks: Artwork[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return artworks;
    return artworks.filter((a) => {
      const hay = `${a.artist?.name || ''} ${a.title} ${a.seenAt} ${a.year} ${a.medium}`.toLowerCase();
      return hay.includes(q);
    });
  }, [artworks, query]);

  const withImage = filtered.filter((a) => a.image).length;
  const total = filtered.length;

  return (
    <div className="mx-auto max-w-[1100px] px-6 lg:px-12">
      <div className="mb-12 flex items-baseline justify-between gap-4 flex-wrap">
        <input
          type="text"
          placeholder="Search by artist, title, museum..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="text-[14px] py-2 border-b border-rule bg-transparent focus:outline-none focus:border-ink transition-colors flex-1 min-w-[260px] max-w-[420px]"
        />
        <p className="text-[12px] text-muted tabular-nums whitespace-nowrap">
          {total} {total === 1 ? 'work' : 'works'}
          {total > 0 && (
            <span className="ml-3">{withImage} with image</span>
          )}
        </p>
      </div>

      <ul className="divide-y divide-rule">
        {filtered.map((a) => {
          const hasImage = !!a.image;
          const inner = (
            <div className="flex items-baseline gap-6 py-5 group">
              <div className="flex-shrink-0 w-12 text-[10px] uppercase tracking-[0.12em] text-muted pt-1">
                {hasImage ? 'image' : ''}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <div className="text-[15px] text-ink">
                    <span className={hasImage ? 'group-hover:opacity-60 transition-opacity' : ''}>
                      {a.artist?.name || 'Unknown'}
                      <span className="text-muted"> {'  ‶  '}</span>
                      <span className="italic">{a.title}</span>
                    </span>
                  </div>
                  <div className="text-[12px] text-muted tabular-nums whitespace-nowrap">
                    {a.year || ''}
                  </div>
                </div>
                <div className="mt-1 text-[12px] text-muted">
                  {[a.medium, a.seenAt].filter(Boolean).join('  ·  ')}
                </div>
              </div>
            </div>
          );

          if (hasImage) {
            return (
              <li key={a.slug}>
                <Link href={`/work/${a.slug}`} scroll={false} className="block">
                  {inner}
                </Link>
              </li>
            );
          }
          return <li key={a.slug}>{inner}</li>;
        })}
      </ul>

      {filtered.length === 0 && (
        <p className="mt-12 text-center text-[13px] text-muted">No works match.</p>
      )}
    </div>
  );
}
