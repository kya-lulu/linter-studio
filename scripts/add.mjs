#!/usr/bin/env node
/**
 * Add an artwork to the collection.
 *
 *   npm run add -- "Hockney A Bigger Splash"
 *   npm run add -- "Vermeer Milkmaid" --museum=met
 *   npm run add -- "Monet Water Lilies" --seen-at="MoMA, New York"
 *
 * Searches Met → Cleveland → Art Institute of Chicago for the work,
 * downloads the highest-resolution open-access image, generates a
 * description, and appends to data/artworks.json.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'artworks.json');
const IMAGES_DIR = path.join(ROOT, 'public', 'artworks');

// ---------- args ----------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
    else if (a.startsWith('--')) flags[a.slice(2)] = true;
    else positional.push(a);
  }
  return { query: positional.join(' ').trim(), flags };
}

// ---------- helpers ----------

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(text, maxSentences = 4) {
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.slice(0, maxSentences).join(' ').trim();
}

function parseArtistDates(displayString) {
  // "Vincent van Gogh, Dutch, 1853–1890" or "Claude Monet (French, 1840–1926)" etc.
  const range = displayString.match(/(\d{4})\s*[–-]\s*(\d{4})/);
  if (range) return { birth: +range[1], death: +range[2] };
  const bornOnly = displayString.match(/born\s*(\d{4})/i);
  if (bornOnly) return { birth: +bornOnly[1], death: null };
  const single = displayString.match(/(\d{4})/);
  if (single) return { birth: +single[1], death: null };
  return { birth: 0, death: null };
}

function extImageUrl(url) {
  const m = url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
  return m ? '.' + m[1].toLowerCase() : '.jpg';
}

async function downloadImage(url, destPath) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'linter.studio/1.0 (collection automation)',
    },
  });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

async function imageDimensions(filePath) {
  // Lightweight inline JPEG/PNG dimension reader; no external deps.
  const buf = await fs.readFile(filePath);
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    // PNG
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    // JPEG: walk segments
    let off = 2;
    while (off < buf.length) {
      if (buf[off] !== 0xff) break;
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      // SOFn markers (excluding DHT, JPG, DAC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = buf.readUInt16BE(off + 5);
        const width = buf.readUInt16BE(off + 7);
        return { width, height };
      }
      off += 2 + len;
    }
  }
  throw new Error('Could not read image dimensions');
}

// ---------- museum adapters ----------

const UA = { 'User-Agent': 'linter.studio/1.0 (collection automation)' };

async function searchMet(q) {
  const sr = await fetch(
    `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(q)}&hasImages=true`,
    { headers: UA }
  );
  if (!sr.ok) return null;
  const sd = await sr.json();
  const ids = sd.objectIDs || [];

  // Tokenize query for relevance scoring
  const qTokens = q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  // Fetch top candidates and rank by token overlap with title + artist
  const candidates = [];
  for (const id of ids.slice(0, 20)) {
    const r = await fetch(
      `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
      { headers: UA }
    );
    if (!r.ok) continue;
    const o = await r.json();
    if (!o.primaryImage || !o.isPublicDomain) continue;

    const haystack = `${o.title} ${o.artistDisplayName || ''}`.toLowerCase();
    const score = qTokens.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
    candidates.push({ score, o });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0].o;

  return {
    source: 'met',
    title: best.title,
    artistName: best.artistDisplayName || 'Unknown',
    artistDates: { birth: +best.artistBeginDate || 0, death: +best.artistEndDate || null },
    year: best.objectDate || '',
    medium: best.medium || '',
    paintedIn: best.city || best.country || null,
    seenAt: 'The Met, New York',
    description: '',
    imageUrl: best.primaryImage,
    objectUrl: best.objectURL,
    altText: `${best.artistDisplayName || ''}, ${best.title}`,
  };
}

async function searchCleveland(q) {
  const r = await fetch(
    `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q)}&has_image=1&limit=5`,
    { headers: UA }
  );
  if (!r.ok) return null;
  const d = await r.json();
  const items = d.data || [];
  for (const a of items) {
    const img = a.images?.web?.url || a.images?.print?.url;
    if (!img) continue;
    const creator = a.creators?.[0] || {};
    const artistName = (creator.description || '').split(/[,(]/)[0].trim() || 'Unknown';
    const dates = parseArtistDates(creator.description || '');
    return {
      source: 'cleveland',
      title: a.title,
      artistName,
      artistDates: dates,
      year: a.creation_date || '',
      medium: a.technique || '',
      paintedIn: a.culture?.[0] || null,
      seenAt: 'Cleveland Museum of Art',
      description: htmlToText(a.description || a.tombstone || ''),
      imageUrl: img,
      objectUrl: a.url || `https://www.clevelandart.org/art/${a.accession_number}`,
      altText: `${artistName}, ${a.title}`,
    };
  }
  return null;
}

async function searchAIC(q) {
  const r = await fetch(
    `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&limit=5&fields=id,title,artist_display,date_display,medium_display,place_of_origin,image_id,artist_title,description,thumbnail`,
    { headers: UA }
  );
  if (!r.ok) return null;
  const d = await r.json();
  const items = d.data || [];
  for (const a of items) {
    if (!a.image_id) continue;
    const dates = parseArtistDates(a.artist_display || '');
    const imageUrl = `${d.config.iiif_url}/${a.image_id}/full/1686,/0/default.jpg`;
    return {
      source: 'aic',
      title: a.title,
      artistName: a.artist_title || (a.artist_display || '').split('\n')[0],
      artistDates: dates,
      year: a.date_display || '',
      medium: a.medium_display || '',
      paintedIn: a.place_of_origin || null,
      seenAt: 'Art Institute of Chicago',
      description: htmlToText(a.description || ''),
      imageUrl,
      objectUrl: `https://www.artic.edu/artworks/${a.id}`,
      altText: a.thumbnail?.alt_text || `${a.artist_title}, ${a.title}`,
    };
  }
  return null;
}

const ADAPTERS = {
  met: searchMet,
  cleveland: searchCleveland,
  aic: searchAIC,
};

async function findArtwork(query, preferredMuseum) {
  const order = preferredMuseum
    ? [preferredMuseum, ...Object.keys(ADAPTERS).filter((k) => k !== preferredMuseum)]
    : ['met', 'cleveland', 'aic'];

  for (const key of order) {
    const fn = ADAPTERS[key];
    if (!fn) continue;
    try {
      const result = await fn(query);
      if (result) return result;
    } catch (err) {
      console.warn(`  [${key}] error:`, err.message);
    }
  }
  return null;
}

// ---------- main ----------

async function main() {
  const { query, flags } = parseArgs(process.argv.slice(2));
  if (!query) {
    console.error('Usage: npm run add -- "<artwork query>" [--museum=met|cleveland|aic] [--seen-at="Museum, City"]');
    process.exit(1);
  }

  console.log(`\n→ Searching for: "${query}"`);
  const found = await findArtwork(query, flags.museum);
  if (!found) {
    console.error('  No open-access result found. Try a different query or --museum.');
    process.exit(1);
  }
  console.log(`  Found in ${found.source}: ${found.artistName} — ${found.title}`);

  // Download image
  const slug = slugify(`${found.artistName}-${found.title}`);
  const ext = extImageUrl(found.imageUrl);
  const imagePath = path.join(IMAGES_DIR, slug + ext);
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  console.log(`  Downloading image…`);
  await downloadImage(found.imageUrl, imagePath);
  const dims = await imageDimensions(imagePath);
  console.log(`  ${dims.width}×${dims.height}`);

  // Build entry
  const entry = {
    slug,
    title: found.title,
    artist: {
      name: found.artistName,
      birth: found.artistDates.birth,
      death: found.artistDates.death,
    },
    year: found.year,
    medium: found.medium,
    paintedIn: found.paintedIn,
    seenAt: flags['seen-at'] || found.seenAt,
    description: shorten(found.description, 4) || `${found.title}, ${found.year}.`,
    image: {
      src: `/artworks/${slug}${ext}`,
      width: dims.width,
      height: dims.height,
      alt: found.altText,
    },
    sourceUrl: found.objectUrl,
  };

  // Append, dedupe by slug
  const existing = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  const filtered = existing.filter((a) => a.slug !== slug);
  filtered.push(entry);
  await fs.writeFile(DATA_FILE, JSON.stringify(filtered, null, 2) + '\n');

  console.log(`✓ Added "${entry.title}" by ${entry.artist.name} (${filtered.length} total works)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
