#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'artworks.json');
const INTAKE_FILE = path.join(ROOT, 'data', 'intake-list.txt');
const IMAGES_DIR = path.join(ROOT, 'public', 'artworks');

const STARTER_SLUGS = new Set([
  'pieter-bruegel-the-elder-the-harvesters',
  'caravaggio-michelangelo-merisi-the-musicians',
  'el-greco-domenikos-theotokopoulos-view-of-toledo',
  'rembrandt-rembrandt-van-rijn-aristotle-with-a-bust-of-homer',
  'johannes-vermeer-young-woman-with-a-water-pitcher',
  'jacques-louis-david-the-death-of-socrates',
  'katsushika-hokusai-under-the-wave-off-kanagawa-kanagawa-oki-nami-ura-or-the-grea',
  'utagawa-hiroshige-plum-garden-at-kamata',
  'joseph-mallord-william-turner-whalers',
  'edouard-manet-boating',
  'edgar-degas-the-dancing-class',
  'paul-cezanne-the-card-players',
  'vincent-van-gogh-wheat-field-with-cypresses',
  'auguste-rodin-the-thinker',
  'john-singer-sargent-madame-x-virginie-amelie-avegno-gautreau',
  'gustav-klimt-mada-primavesi-1903-2000',
]);

const VERIFIED_QUERIES = new Set([
  'Haystacks Autumn by millet',
  'North cape by peder balke',
  'Jan van de cappelle- sea piece : a calm',
  'Sisley- saint cloud',
  'John martin- le pandemonium',
  'Highway of combes la vulle by Giovanni boldini',
  'The enigma of Hitler - salvador Dali',
  'Feuilles places selon Les Lois du hasard - Jean arp',
  'Winter landscape - Caspar David Friedrich',
  'Fisherman at derwentwater by Thomas fearnley',
  'Jym seated iv by Frank Auerbach',
  'The pond by corot',
  'Frederic Remington - parley',
  'Number 12-1949 by Bradley walker Tomlin',
  'Aurora borealis by church',
  'Breakfast in the loggia by Sargent',
  "Rehearsal of the pasdeloup orchestra at the cirque dhiver by Sargent",
  'Simon, comte de crepy by Georges Mathieu',
  'Elizabeth Platt jencks by Thomas Wilmer dewing',
  'America the beautiful by Norman Lewis',
  'Seestuck by Gerhard richter',
  'Spring in the alps by Giovanni segantini',
  'Not manets type by Carrie Mae weems',
  'Avenue du bois by Kees van dongen',
  'Le printemps by alexandre calame',
  'La jungfrau vue de murren by hodler',
  'Isles of shoals by hassam',
  'Flatland river by Wayne thiebaud',
  'Picture of the sumida river seen from beneath the Azuma bridge by Hokusai',
  'Oskar kokoschka - Hans tietze and Erica tietze',
  'Misty sea by jan toorop',
  'Painting with a green center by kandinsky',
  'The rest body by odilon redon',
  'Le coin du lac by Rosa bonheur',
  'Indian canoe by bierstadt',
  'Waterloo bridge by monet',
  "The nightingale's song at midnight and the morning rain by miro",
  'Flower seller in London by Jules bastien Lepage',
  'Sept portrait by Daniel de monfreid',
  'Lorna Simpson - vertigo',
  'Robert henri - Gertrude Vanderbilt Whitney',
  'Chiura Obata - upper Lyell fork',
]);

async function main() {
  const all = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  console.log(`Before: ${all.length} entries`);

  const kept = [];
  for (const entry of all) {
    const isStarter = STARTER_SLUGS.has(entry.slug);
    const isVerified = entry.sourceQuery && VERIFIED_QUERIES.has(entry.sourceQuery);
    if (isStarter || isVerified) kept.push(entry);
  }
  console.log(`Kept: ${kept.length}`);
  console.log(`Wiping: ${all.length - kept.length}`);

  const keepImages = new Set();
  for (const e of kept) {
    if (e.image && e.image.src) keepImages.add(path.basename(e.image.src));
  }
  const allImages = await fs.readdir(IMAGES_DIR);
  let removed = 0;
  for (const img of allImages) {
    if (!keepImages.has(img)) {
      await fs.unlink(path.join(IMAGES_DIR, img));
      removed++;
    }
  }
  console.log(`Removed ${removed} orphan images`);

  await fs.writeFile(DATA_FILE, JSON.stringify(kept, null, 2) + '\n');

  const intake = await fs.readFile(INTAKE_FILE, 'utf8');
  const lines = intake.split('\n').map((l) => l.trim()).filter(Boolean);
  const todo = lines.filter((l) => !VERIFIED_QUERIES.has(l));
  await fs.writeFile(path.join(ROOT, 'data', 'intake-todo.txt'), todo.join('\n') + '\n');

  console.log(`\nWrote data/intake-todo.txt: ${todo.length} entries to import`);
  console.log(`\nNext: npm run import-strict -- data/intake-todo.txt`);
}

main().catch((err) => { console.error(err); process.exit(1); });
