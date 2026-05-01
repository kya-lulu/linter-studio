'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Artwork } from '@/lib/types';

export default function ArtworkTile({ artwork }: { artwork: Artwork }) {
  const { image, title, artist, year } = artwork;

  return (
    <Link
      href={`/work/${artwork.slug}`}
      scroll={false}
      className="tile group block"
      aria-label={`${artist.name}, ${title}, ${year}`}
    >
      <div className="relative w-full overflow-hidden bg-rule/30">
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 25vw"
          className="block w-full h-auto transition-opacity duration-500 ease-gallery"
        />
      </div>
      <div className="tile-caption mt-3 text-[13px] leading-tight">
        <div className="text-ink">{artist.name}</div>
        <div className="text-muted italic">
          {title}, {year}
        </div>
      </div>
    </Link>
  );
}
