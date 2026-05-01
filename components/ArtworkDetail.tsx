import Image from 'next/image';
import type { Artwork } from '@/lib/types';
import { formatArtistDates } from '@/lib/artworks';

function MetaRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="text-[14px] text-ink">{value}</div>
    </div>
  );
}

export default function ArtworkDetail({ artwork }: { artwork: Artwork }) {
  const { image, title, artist, year, medium, paintedIn, seenAt, description } = artwork;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
      <div className="lg:col-span-7">
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="(max-width: 1024px) 100vw, 60vw"
          priority
          className="block w-full h-auto"
        />
      </div>

      <div className="lg:col-span-5 lg:sticky lg:top-12">
        <div className="max-w-md">
          <h1 className="text-[24px] leading-tight font-semibold text-ink">{title}</h1>
          <p className="mt-2 text-[15px] text-ink">
            {artist.name}
            <span className="text-muted">  ({formatArtistDates(artist)})</span>
          </p>

          <div className="mt-8 grid grid-cols-2 gap-y-5 gap-x-6">
            <MetaRow label="Year" value={year} />
            <MetaRow label="Medium" value={medium} />
            <MetaRow label="Painted in" value={paintedIn} />
            <MetaRow label="Seen at" value={seenAt} />
          </div>

          <div className="mt-10 pt-8 border-t border-rule">
            <p className="text-[15px] leading-[1.7] text-ink/85">{description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
