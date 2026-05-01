#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'artworks.json');

const BAD_QUERIES = [
  'Renoir- two files and piani',
  'Young orphan girl in cemetery - delacroix',
  'Young orphan girl in the cemetery by Delacroix',
  'Canny Glasgow - John Atkinson grimshaw',
  'Painting 10 mov 1953 - Pierre soulages',
  'Number 179- Luis feito',
  'Portrait of Sarah Bernhardt by Alfred stevens',
  'Girl in garden by Cassatt',
  'Green dress by matisse',
  'The girl by the window by munch',
  'Field with irises near Arles by Van Gogh',
  'Cottage in Normandy by Monet',
  'Head of an old man by tiepolo',
  'Self portrait by Dorothea tanning',
  'Self portrait by bazille',
];

async function main() {
  const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  let reverted = 0;

  for (const entry of data) {
    if (!entry.image || !entry.sourceQuery) continue;
    const isBad = BAD_QUERIES.some((bq) =>
      entry.sourceQuery.includes(bq) || bq.includes(entry.sourceQuery)
    );
    if (!isBad) continue;

    if (entry.image && entry.image.src) {
      const imgPath = path.join(ROOT, 'public', entry.image.src.replace(/^\//, ''));
      try { await fs.unlink(imgPath); } catch {}
    }

    entry.image = null;
    entry.description = '';
    entry.year = '';
    entry.medium = '';
    entry.paintedIn = null;
    entry.seenAt = 'Museum visit';
    delete entry.sourceUrl;

    reverted++;
    console.log('reverted: ' + entry.sourceQuery);
  }

  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log('\nReverted ' + reverted + ' bad matches back to placeholders.');
}

main().catch((err) => { console.error(err); process.exit(1); });

