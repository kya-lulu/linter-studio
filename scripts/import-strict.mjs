#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'artworks.json');
const IMAGES_DIR = path.join(ROOT, 'public', 'artworks');
const UA = { 'User-Agent': 'linter.studio/1.0' };

function slugify(s) {
  return s.toLowerCase().replace(/['"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
function shorten(text, n = 3) {
  if (!text) return '';
  const c = text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
  const s = c.match(/[^.!?]+[.!?]+/g) || [c];
  return s.slice(0, n).join(' ').trim();
}
function extImageUrl(url) {
  const m = url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
  return m ? '.' + m[1].toLowerCase() : '.jpg';
}
async function downloadImage(url, dest) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error('Image fetch failed: ' + res.status);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}
async function imageDimensions(fp) {
  const buf = await fs.readFile(fp);
  if (buf[0] === 0x89 && buf[1] === 0x50) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off < buf.length) {
      if (buf[off] !== 0xff) break;
      const m = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      off += 2 + len;
    }
  }
  return { width: 1200, height: 1200 };
}
function parseLine(line) {
  const t = line.trim();
  if (!t) return null;
  const by = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) return { title: by[1].trim(), artist: by[2].trim(), raw: t };
  const dash = t.match(/^([^-]+?)\s*-\s*(.+)$/);
  if (dash) return { title: dash[2].trim(), artist: dash[1].trim(), raw: t };
  return { title: '', artist: t, raw: t };
}
function lastName(a) {
  if (!a) return '';
  const tk = a.toLowerCase().replace(/[^a-z\s'\-]/gi, '').trim().split(/\s+/);
  return tk[tk.length - 1] || '';
}
function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function isStrictMatch(q, r) {
  const ql = lastName(q.artist);
  const qt = norm(q.title).split(' ').filter((t) => t.length > 3);
  const ra = norm(r.artistName || '');
  const rt = norm(r.title || '');
  if (!ql || !ra.includes(ql)) return false;
  if (qt.length === 0) return true;
  return qt.some((t) => rt.includes(t));
}
async function wikiSearch(q) {
  try {
    const r = await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(q + ' painting') + '&srlimit=5&format=json&origin=*', { headers: UA });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.query && d.query.search) || [];
  } catch { return []; }
}
async function wikiSummary(t) {
  try {
    const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g, '_')), { headers: UA });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.type === 'disambiguation') return null;
    return { title: d.title, extract: d.extract || '', imageUrl: (d.originalimage && d.originalimage.source) || null, pageUrl: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || null };
  } catch { return null; }
}
async function findOnWikipedia(p) {
  const queries = [p.title + ' ' + p.artist, p.title];
  for (const q of queries) {
    const hits = await wikiSearch(q);
    for (const hit of hits) {
      const s = await wikiSummary(hit.title);
      if (!s || !s.extract) continue;
      const exNorm = norm(s.extract);
      const ln = lastName(p.artist);
      if (!ln || !exNorm.includes(ln)) continue;
      const qt = norm(p.title).split(' ').filter((t) => t.length > 3);
      const titleNorm = norm(s.title);
      if (qt.length > 0 && !qt.some((t) => titleNorm.includes(t) || exNorm.includes(t))) continue;
      return {
        source: 'wikipedia',
        title: s.title.replace(/\s*\([^)]*\)\s*$/, ''),
        artistName: p.artist,
        artistDates: { birth: 0, death: null },
        year: '', medium: '', paintedIn: null,
        seenAt: 'Museum visit',
        description: shorten(s.extract, 3),
        imageUrl: s.imageUrl, objectUrl: s.pageUrl,
        altText: p.artist + ', ' + s.title,
      };
    }
  }
  return null;
}
async function findOnMet(p) {
  const q = (p.title + ' ' + p.artist).trim();
  const sr = await fetch('https://collectionapi.metmuseum.org/public/collection/v1/search?q=' + encodeURIComponent(q) + '&hasImages=true', { headers: UA });
  if (!sr.ok) return null;
  const sd = await sr.json();
  for (const id of (sd.objectIDs || []).slice(0, 8)) {
    const r = await fetch('https://collectionapi.metmuseum.org/public/collection/v1/objects/' + id, { headers: UA });
    if (!r.ok) continue;
    const o = await r.json();
    if (!o.primaryImage || !o.isPublicDomain) continue;
    const c = {
      source: 'met', title: o.title,
      artistName: o.artistDisplayName || 'Unknown',
      artistDates: { birth: +o.artistBeginDate || 0, death: +o.artistEndDate || null },
      year: o.objectDate || '', medium: o.medium || '',
      paintedIn: o.city || o.country || null,
      seenAt: 'The Met, New York', description: '',
      imageUrl: o.primaryImage, objectUrl: o.objectURL,
      altText: (o.artistDisplayName || '') + ', ' + o.title,
    };
    if (isStrictMatch(p, c)) return c;
  }
  return null;
}
function setupRl() { return readline.createInterface({ input: process.stdin, output: process.stdout }); }
function ask(rl, q) { return new Promise((res) => rl.question(q, (a) => res(a.trim().toLowerCase()))); }

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith('--'));
  const autoYes = args.includes('--yes');
  if (!filePath) { console.error('Usage: npm run import-strict -- path/to/list.txt'); process.exit(1); }
  const raw = await fs.readFile(filePath, 'utf8');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  console.log('\n' + lines.length + ' lines to process\n');
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const existing = JSON.parse(await fs.readFile(DATA_FILE, 'utf8').catch(() => '[]'));
  const existingSlugs = new Set(existing.map((a) => a.slug));
  const rl = autoYes ? null : setupRl();
  let accepted = 0, rejected = 0, missing = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const p = parseLine(line);
    process.stdout.write('\n[' + (i + 1) + '/' + lines.length + '] ' + line + '\n');
    if (!p || !p.title) { console.log('  skipped (no title)'); missing++; continue; }
    let found = null;
    process.stdout.write('  Wikipedia... ');
    try { found = await findOnWikipedia(p); } catch {}
    if (found) console.log('found "' + found.title + '"');
    else {
      console.log('miss');
      process.stdout.write('  Met...       ');
      try { found = await findOnMet(p); } catch {}
      if (found) console.log('found "' + found.title + '" by ' + found.artistName);
      else console.log('miss');
    }
    if (!found) {
      const slug = slugify(p.artist + '-' + p.title);
      if (!existingSlugs.has(slug)) {
        existing.push({ slug, title: p.title, artist: { name: p.artist || 'Unknown', birth: 0, death: null }, year: '', medium: '', paintedIn: null, seenAt: 'Museum visit', description: '', image: null, sourceQuery: line });
        existingSlugs.add(slug);
        await fs.writeFile(DATA_FILE, JSON.stringify(existing, null, 2) + '\n');
        console.log('  placeholder (no match)');
      }
      continue;
    }
    console.log('     Title:  ' + found.title);
    console.log('     Artist: ' + found.artistName);
    if (found.description) {
      const prev = found.description.slice(0, 140) + (found.description.length > 140 ? '...' : '');
      console.log('     Note:   ' + prev);
    }
    if (found.objectUrl) console.log('     URL:    ' + found.objectUrl);
    let ans = 'y';
    if (!autoYes) { ans = await ask(rl, '  Accept? [Y/n/s/q] '); if (ans === '') ans = 'y'; }
    if (ans === 'q') { console.log('\nQuit.'); break; }
    if (ans === 'n' || ans === 's') {
      rejected++;
      const slug = slugify(p.artist + '-' + p.title);
      if (!existingSlugs.has(slug)) {
        existing.push({ slug, title: p.title, artist: { name: p.artist || 'Unknown', birth: 0, death: null }, year: '', medium: '', paintedIn: null, seenAt: 'Museum visit', description: '', image: null, sourceQuery: line });
        existingSlugs.add(slug);
        await fs.writeFile(DATA_FILE, JSON.stringify(existing, null, 2) + '\n');
      }
      console.log('  placeholder kept');
      continue;
    }
    const slug = slugify(found.artistName + '-' + found.title);
    if (existingSlugs.has(slug)) { console.log('  already in collection'); continue; }
    let imgMeta = null;
    if (found.imageUrl) {
      const ext = extImageUrl(found.imageUrl);
      const ip = path.join(IMAGES_DIR, slug + ext);
      try {
        await downloadImage(found.imageUrl, ip);
        const d = await imageDimensions(ip);
        imgMeta = { src: '/artworks/' + slug + ext, width: d.width, height: d.height, alt: found.altText };
      } catch (e) { console.log('  image download failed: ' + e.message); }
    }
    existing.push({
      slug, title: found.title,
      artist: { name: found.artistName, birth: found.artistDates.birth, death: found.artistDates.death },
      year: found.year, medium: found.medium, paintedIn: found.paintedIn,
      seenAt: found.seenAt, description: shorten(found.description, 4),
      image: imgMeta, sourceUrl: found.objectUrl, sourceQuery: line,
    });
    existingSlugs.add(slug);
    await fs.writeFile(DATA_FILE, JSON.stringify(existing, null, 2) + '\n');
    accepted++;
    console.log('  saved (' + accepted + ' accepted)');
  }
  if (rl) rl.close();
  console.log('\n' + '='.repeat(60));
  console.log('Accepted: ' + accepted + ' | Rejected: ' + rejected + ' | Missing: ' + missing);
  console.log('Total in collection: ' + existing.length);
}

main().catch((err) => { console.error(err); process.exit(1); });
