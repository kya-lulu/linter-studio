# linter.studio

A personal collection of artworks seen in museums. Built with Next.js, Tailwind, and Inter — designed to feel like the MoMA online collection: clean white, generous space, the work first.

## Quick Start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Adding Artworks (Automated)

The site ships with a CLI that does all the work. You give it an artwork name; it searches open-access museum APIs (the Met, Cleveland Museum of Art, Art Institute of Chicago), downloads the highest-resolution image into `/public/artworks/`, generates the metadata, and appends to `/data/artworks.json`.

### Importing a list of artworks (batch)

If you have many works to add at once, drop them in a text file (one per line, format: `Title by Artist` or `Artist - Title`) and run:

```bash
npm run import -- data/intake-list.txt
```

The script will:
1. Search Met → Cleveland → Art Institute of Chicago for each line
2. Fall back to Wikipedia for image + description if the museum APIs miss
3. Write a placeholder entry (text only) for anything that can't be found
4. Save a report to `/tmp/import-report.tsv` showing what happened to every line

A starter list (252 works, your visit history) ships in `data/intake-list.txt`. Run the import once and let the script populate the wall, then review the report and clean up any bad matches by editing `data/artworks.json` directly.

### Adding one at a time

```bash
# Search across all museums
npm run add -- "Vermeer Young Woman with a Water Pitcher"

# Force a specific museum
npm run add -- "Hopper Tables for Ladies" --museum=met

# Override where you saw it (default uses the museum that owns the work)
npm run add -- "Monet Water Lilies" --seen-at="MoMA, New York"
```

Tips for good matches:

- **Include the artist's full name** — "Joseph Mallord William Turner Whalers" beats "Turner Whalers"
- **Include a year if the title is generic** — "Manet Boating 1874" disambiguates
- The Met has the largest open-access collection (~500,000 public-domain works); start there.

After adding, the wall updates on next page load (or restart `npm run dev`).

### Enriching descriptions

```bash
npm run enrich            # fill in descriptions from Wikipedia for any work missing one
npm run enrich -- --force # re-fetch all descriptions
```

The enrich script queries the Wikipedia REST API for each work's article and pulls the first 2–3 sentences. Works without a Wikipedia article are skipped — those you can hand-write directly in the JSON.

### Manual editing

`/data/artworks.json` is plain JSON. Edit any field directly — fix a typo, refine a description, change the medium. **The order of items in the file is the order on the wall** — drag entries up and down to reorder your hang.

### Schema

```ts
{
  slug: string;            // url id, e.g. "vermeer-milkmaid"
  title: string;
  artist: {
    name: string;
    birth: number;
    death: number | null;  // null for living artists
  };
  year: string;            // "1660" or "c. 1660" or "1660–62"
  medium: string;
  paintedIn: string | null;
  seenAt: string;          // "Museum Name, City"
  description: string;     // wall text
  image: {
    src: string;           // "/artworks/<slug>.jpg"
    width: number;         // native pixel dims
    height: number;
    alt: string;
  };
  sourceUrl?: string;      // museum object page (added by `npm run add`)
}
```

## Deploying to Vercel + linter.studio

1. **Push to GitHub:**

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Connect to Vercel:** go to <https://vercel.com/new>, import the repo. Framework auto-detected as Next.js. Click Deploy.

3. **Add the custom domain:** in the Vercel project, Settings → Domains → Add `linter.studio`.

4. **Update DNS at your registrar (where you bought linter.studio):**
   - `A` record: `@` → `76.76.21.21`
   - `CNAME` record: `www` → `cname.vercel-dns.com`

   SSL is auto-issued by Vercel. DNS propagation usually takes 5–30 minutes.

## Project Structure

```
app/
  layout.tsx              — root shell, Inter font, parallel modal slot
  page.tsx                — the wall
  globals.css             — base styles, masonry CSS
  work/[slug]/page.tsx    — full-page artwork (shareable URL)
  @modal/
    default.tsx           — empty fallback for the modal slot
    (.)work/[slug]/page.tsx — intercepted modal version

components/
  Wall.tsx                — masonry grid + filter/shuffle controls
  ArtworkTile.tsx         — single tile
  ArtworkDetail.tsx       — shared detail view (used by modal & page)
  Modal.tsx               — overlay with ESC, click-outside, scroll lock

data/artworks.json        — your collection
lib/                      — types and data helpers
public/artworks/          — image files

scripts/
  add.mjs                 — search museum APIs, download, append to JSON
  enrich.mjs              — fill descriptions from Wikipedia
```

## How the Modal Works

Next.js parallel + intercepting routes (the `@modal` slot + `(.)` interception):

- **Click a tile from the wall** → modal opens *over* the wall (URL changes to `/work/<slug>`).
- **Press ESC, click ×, or click outside** → returns to the wall at the exact scroll position.
- **Share the URL or open it directly** → loads as a full page with a "Back to wall" link.

## Curatorial Notes

The order of items in `artworks.json` is your "hang" — the deliberate sequence in which a visitor encounters the collection. Think of it as the line of sight through your gallery wing. The Shuffle button in the UI offers a serendipitous alternative reading.

The museum filter rail uses the `seenAt` field. Keep the format consistent (`Museum Name, City`); the rail labels use just the part before the comma to stay clean.
