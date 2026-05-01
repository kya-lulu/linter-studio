#!/usr/bin/env node
/**
 * Batch import artworks from a text file.
 *
 *   npm run import -- path/to/list.txt
 *   npm run import -- path/to/list.txt --dry-run     # report what would happen, no writes
 *   npm run import -- path/to/list.txt --skip-existing
 *
 * For each line in the file:
 *   1. Search Met → Cleveland → Art Institute of Chicago for the work
 *   2. If found with image → download, write entry
 *   3. If not found → try Wikipedia summary API for image + description
 *   4. If Wikipedia has no usable image → write a "placeholder" entry (text only)
 *
 * Writes a report to /tmp/import-report.tsv listing the result for every line.
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

const UA = { 'User-Agent': 'linter.studio/1.0 (collection automation; contact via github)' };

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
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(text, maxSentences = 3) {
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.slice(0, maxSentences).join(' ').trim();
}

function parseArtistDates(displayString) {
  const range = (displayString || '').match(/(\d{4})\s*[–-]\s*(\d{4})/);
  if (range) return { birth: +range[1], death: +range[2] };
  const bornOnly = (displayString || '').match(/born\s*(\d{4})/i);
  if (bornOnly) return { birth: +bornOnly[1], death: null };
  return { birth: 0, death: null };
}

function extImageUrl(url) {
  const m = url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
  return m ? '.' + m[1].toLowerCase() : '.jpg';
}

async function downloadImage(url, destPath) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

async function imageDimensions(filePath) {
  const buf = await fs.readFile(filePath);
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off < buf.length) {
      if (buf[off] !== 0xff) break;
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      off += 2 + len;
    }
  }
  // Fallback: small unknown dims (don't crash on weird formats)
  return { width: 1000, height: 1000 };
}

// ---------- query parsing ----------

function parseLine(line) {
  // Examples:
  //   "Seurat - evening, hornfleur"
  //   "Forest at pontabeurt by Seurat"
  //   "Old Violin by harnett"
  //   "Phlegm"   ← artist only, no title
  const trimmed = line.trim();
  if (!trimmed) return null;

  // "X by Y"  → title=X, artist=Y
  const byMatch = trimmed.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim(), raw: trimmed };

  // "Y - X"  → artist=Y, title=X (when there's a single dash)
  const dashMatch = trimmed.match(/^([^-]+?)\s*[-–]\s*(.+)$/);
  if (dashMatch) {
    // Heuristic: if the right side is shorter or contains a comma, it's the title
    const left = dashMatch[1].trim();
    const right = dashMatch[2].trim();
    return { title: right, artist: left, raw: trimmed };
  }

  // No separator — could be artist-only or title-only
  return { title: '', artist: trimmed, raw: trimmed };
}

// ---------- museum adapters (same as add.mjs, condensed) ----------

async function searchMet(q) {
  const sr = await fetch(
    `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(q)}&hasImages=true`,
    { headers: UA }
  );
  if (!sr.ok) return null;
  const sd = await sr.json();
  const ids = sd.objectIDs || [];
  if (ids.length === 0) return null;

  const qTokens = q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  const candidates = [];
  for (const id of ids.slice(0, 15)) {
    const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, { headers: UA });
    if (!r.ok) continue;
    const o = await r.json();
    if (!o.primaryImage || !o.isPublicDomain) continue;
    const haystack = `${o.title} ${o.artistDisplayName || ''}`.toLowerCase();
    const score = qTokens.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
    if (score < 2) continue; // require at least 2 token hits
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

// ---------- Wikipedia fallback ----------

async function searchWikipedia(query) {
  // Use Wikipedia search API to find best matching article, then summary API for details
  try {
    const sUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' painting')}&srlimit=3&format=json&origin=*`;
    const sr = await fetch(sUrl, { headers: UA });
    if (!sr.ok) return null;
    const sd = await sr.json();
    const hits = sd.query?.search || [];
    for (const h of hits) {
      const summary = await fetchWikiSummary(h.title);
      if (summary && (summary.extract || summary.thumbnail)) return summary;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchWikiSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.type === 'disambiguation') return null;
    return {
      title: d.title,
      extract: d.extract || '',
      imageUrl: d.originalimage?.source || null,
      pageUrl: d.content_urls?.desktop?.page || null,
    };
  } catch {
    return null;
  }
}

// ---------- main ----------

async function processOne(parsed, seenSlugs) {
  // Build search queries — try several phrasings
  const queries = [];
  if (parsed.title && parsed.artist) {
    queries.push(`${parsed.title} ${parsed.artist}`);
    queries.push(`${parsed.artist} ${parsed.title}`);
  } else if (parsed.title) {
    queries.push(parsed.title);
  } else if (parsed.artist) {
    queries.push(parsed.artist);
  }

  // Try museum APIs
  for (const q of queries) {
    for (const adapter of [searchMet, searchCleveland, searchAIC]) {
      try {
        const r = await adapter(q);
        if (r) return { ...r, query: q };
      } catch {
        // continue
      }
    }
  }

  // Fallback to Wikipedia
  for (const q of queries) {
    const wiki = await searchWikipedia(q);
    if (wiki && wiki.imageUrl) {
      return {
        source: 'wikipedia',
        title: wiki.title.split(/\s*\(/)[0],
        artistName: parsed.artist || 'Unknown',
        artistDates: { birth: 0, death: null },
        year: '',
        medium: '',
        paintedIn: null,
        seenAt: 'Museum visit',
        description: shorten(wiki.extract, 3),
        imageUrl: wiki.imageUrl,
        objectUrl: wiki.pageUrl,
        altText: `${parsed.artist || ''}, ${wiki.title}`.trim(),
        query: q,
      };
    }
    // Even without an image, we might get a description
    if (wiki && wiki.extract) {
      return {
        source: 'wikipedia-text',
        title: wiki.title.split(/\s*\(/)[0],
        artistName: parsed.artist || 'Unknown',
        artistDates: { birth: 0, death: null },
        year: '',
        medium: '',
        paintedIn: null,
        seenAt: 'Museum visit',
        description: shorten(wiki.extract, 3),
        imageUrl: null,
        objectUrl: wiki.pageUrl,
        altText: `${parsed.artist || ''}, ${wiki.title}`.trim(),
        query: q,
      };
    }
  }

  return null; // total miss
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const skipExisting = args.includes('--skip-existing');

  if (!filePath) {
    console.error('Usage: npm run import -- path/to/list.txt [--dry-run] [--skip-existing]');
    process.exit(1);
  }

  const raw = await fs.readFile(filePath, 'utf8');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  // Dedupe
  const seen = new Set();
  const unique = lines.filter((l) => {
    const key = l.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\n📂 ${unique.length} unique entries (from ${lines.length} lines)`);

  await fs.mkdir(IMAGES_DIR, { recursive: true });

  const existing = JSON.parse(await fs.readFile(DATA_FILE, 'utf8').catch(() => '[]'));
  const existingSlugs = new Set(existing.map((a) => a.slug));

  const stats = { met: 0, cleveland: 0, aic: 0, wikipedia: 0, 'wikipedia-text': 0, placeholder: 0, miss: 0, skipped: 0 };
  const report = ['line\tstatus\tsource\ttitle\tartist\tnotes'];

  for (let i = 0; i < unique.length; i++) {
    const line = unique[i];
    const parsed = parseLine(line);
    process.stdout.write(`[${i + 1}/${unique.length}] ${line.slice(0, 60).padEnd(60)} `);

    if (!parsed || (!parsed.title && !parsed.artist)) {
      console.log('⊘ unparseable');
      report.push(`${line}\tunparseable\t\t\t\t`);
      stats.miss++;
      continue;
    }

    // Check for artist-only entries (need a title to find a specific work)
    if (!parsed.title) {
      console.log('⊘ artist-only (no title)');
      report.push(`${line}\tartist-only\t\t\t${parsed.artist}\tneeds a specific work title`);
      stats.miss++;
      continue;
    }

    let found;
    try {
      found = await processOne(parsed, existingSlugs);
    } catch (err) {
      console.log(`✗ error: ${err.message}`);
      report.push(`${line}\terror\t\t\t\t${err.message}`);
      stats.miss++;
      continue;
    }

    if (!found) {
      // Write a placeholder entry
      const slug = slugify(`${parsed.artist}-${parsed.title}`);
      if (existingSlugs.has(slug)) {
        console.log('↪ already exists');
        stats.skipped++;
        continue;
      }
      const entry = {
        slug,
        title: parsed.title,
        artist: { name: parsed.artist || 'Unknown', birth: 0, death: null },
        year: '',
        medium: '',
        paintedIn: null,
        seenAt: 'Museum visit',
        description: '',
        image: null, // marks as placeholder
        sourceQuery: line,
      };
      if (!dryRun) {
        existing.push(entry);
        existingSlugs.add(slug);
      }
      console.log('◯ placeholder (no image found)');
      report.push(`${line}\tplaceholder\t\t${parsed.title}\t${parsed.artist}\t`);
      stats.placeholder++;
      continue;
    }

    const slug = slugify(`${found.artistName}-${found.title}`);
    if (existingSlugs.has(slug)) {
      console.log(`↪ ${found.source}: already in collection`);
      report.push(`${line}\tduplicate\t${found.source}\t${found.title}\t${found.artistName}\t`);
      stats.skipped++;
      continue;
    }

    let entry;
    if (found.imageUrl) {
      const ext = extImageUrl(found.imageUrl);
      const imagePath = path.join(IMAGES_DIR, slug + ext);
      try {
        if (!dryRun) {
          await downloadImage(found.imageUrl, imagePath);
        }
        const dims = dryRun ? { width: 1000, height: 1000 } : await imageDimensions(imagePath);
        entry = {
          slug,
          title: found.title,
          artist: { name: found.artistName, birth: found.artistDates.birth, death: found.artistDates.death },
          year: found.year,
          medium: found.medium,
          paintedIn: found.paintedIn,
          seenAt: found.seenAt,
          description: shorten(found.description, 4) || '',
          image: { src: `/artworks/${slug}${ext}`, width: dims.width, height: dims.height, alt: found.altText },
          sourceUrl: found.objectUrl,
          sourceQuery: line,
        };
        console.log(`✓ ${found.source}: ${found.title.slice(0, 40)}`);
        report.push(`${line}\tok\t${found.source}\t${found.title}\t${found.artistName}\t`);
        stats[found.source] = (stats[found.source] || 0) + 1;
      } catch (err) {
        console.log(`✗ image download failed: ${err.message}`);
        report.push(`${line}\timage-fail\t${found.source}\t${found.title}\t${found.artistName}\t${err.message}`);
        stats.miss++;
        continue;
      }
    } else {
      // Wikipedia text-only
      entry = {
        slug,
        title: found.title,
        artist: { name: found.artistName, birth: found.artistDates.birth, death: found.artistDates.death },
        year: found.year,
        medium: found.medium,
        paintedIn: found.paintedIn,
        seenAt: found.seenAt,
        description: shorten(found.description, 4),
        image: null,
        sourceUrl: found.objectUrl,
        sourceQuery: line,
      };
      console.log(`◐ ${found.source}: text only, no image`);
      report.push(`${line}\ttext-only\t${found.source}\t${found.title}\t${found.artistName}\t`);
      stats[found.source] = (stats[found.source] || 0) + 1;
    }

    if (!dryRun) {
      existing.push(entry);
      existingSlugs.add(slug);
      // Write incrementally so a crash mid-run doesn't lose progress
      await fs.writeFile(DATA_FILE, JSON.stringify(existing, null, 2) + '\n');
    }
  }

  await fs.writeFile('/tmp/import-report.tsv', report.join('\n') + '\n');

  console.log('\n' + '═'.repeat(60));
  console.log('Summary:');
  for (const [k, v] of Object.entries(stats)) {
    if (v > 0) console.log(`  ${k.padEnd(18)} ${v}`);
  }
  console.log(`\nTotal in collection: ${existing.length}`);
  console.log(`Report: /tmp/import-report.tsv`);
  if (dryRun) console.log('\n(dry-run — no writes performed)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
