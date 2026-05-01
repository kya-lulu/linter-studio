export type Artwork = {
  slug: string;
  title: string;
  artist: {
    name: string;
    birth: number;
    death: number | null;
  };
  year: string;
  medium: string;
  paintedIn: string | null;
  seenAt: string;
  description: string;
  image: {
    src: string;
    width: number;
    height: number;
    alt: string;
  };
  dateSeen?: string;
  sourceUrl?: string;
};
