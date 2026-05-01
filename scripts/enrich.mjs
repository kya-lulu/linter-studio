#!/usr/bin/env node
/**
 * Enrich artwork entries with descriptions from Wikipedia.
 *
 *   npm run enrich              — fill in any work missing a real description
 *   npm run enrich -- --force   — re-fetch descriptions for all works
 *
 * Uses Wikipedia's REST summary API to find a page matching
 * "<title> (<artist>)" and pulls the first 2–3 sentences of the extract.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'artworks.json');

const UA = { 'User-Agent': 'linter.studio/1.0 (collection enrichment)' };

function shorten(text, maxSentences = 3) {
  if (!text) return '';
  // Strip parenthetical pronunciations and bracketed citations
  const cleaned = text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  return sentences.slice(0, maxSentences).join(' ').trim();
}

async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, '_')
  )}`;
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.type === 'disambiguation') return null;
    return d.extract || null;
  } catch {
    return null;
  }
}

async function searchAndFetch(query) {
  // Try the Wikipedia search API for the best matching page
  const sUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&srlimit=3&format=json&origin=*`;
  try {
    const r = await fetch(sUrl, { headers: UA });
    if (!r.ok) return null;
    const d = await r.json();
    const hits = d.query?.search || [];
    for (const h of hits) {
      const ext = await fetchSummary(h.title);
      if (ext && ext.length > 80) return ext;
    }
  } catch {
    // ignore
  }
  return null;
}

async function findDescription(artwork) {
  // Try several queries in order of specificity
  const candidates = [
    `${artwork.title} (${artwork.artist.name})`,
    `${artwork.title} ${artwork.artist.name}`,
    artwork.title,
  ];

  for (const q of candidates) {
    const direct = await fetchSummary(q);
    if (direct && direct.length > 80) return direct;
  }
  return await searchAndFetch(`${artwork.title} ${artwork.artist.name} painting`);
}

async function main() {
  const force = process.argv.includes('--force');
  const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));

  let updated = 0;
  for (const a of data) {
    const placeholder = !a.description || a.description.length < 60 ||
      a.description.endsWith(`${a.year}.`);
    if (!force && !placeholder) continue;

    process.stdout.write(`→ ${a.artist.name} — ${a.title}…  `);
    const extract = await findDescription(a);
    if (extract) {
      a.description = shorten(extract, 3);
      console.log('✓');
      updated++;
    } else {
      console.log('skipped (no Wikipedia match)');
    }
    // Be polite to Wikipedia
    await new Promise((r) => setTimeout(r, 250));
  }

  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`\n✓ Enriched ${updated} of ${data.length} works.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
