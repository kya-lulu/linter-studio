import artworksData from '@/data/artworks.json';
import type { Artwork } from './types';

export const artworks: Artwork[] = artworksData as Artwork[];

export function getArtworkBySlug(slug: string): Artwork | undefined {
  return artworks.find((a) => a.slug === slug);
}

export function getAllSlugs(): string[] {
  return artworks.map((a) => a.slug);
}

export function getMuseums(): string[] {
  const set = new Set(artworks.map((a) => a.seenAt));
  return Array.from(set).sort();
}

export function formatArtistDates(artist: Artwork['artist']): string {
  if (artist.death === null) {
    return `b. ${artist.birth}`;
  }
  return `${artist.birth}–${artist.death}`;
}
