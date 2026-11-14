// Writes assets/fonts: Inter cut down to the characters the site prints, and how wide each character is, so the share card can fit text without a browser.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import opentype from 'opentype.js';
import subsetFont from 'subset-font';

const interReleaseUrl = 'https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip';
const fontWeights = { 400: 'Inter-Regular', 600: 'Inter-SemiBold', 700: 'Inter-Bold' };
const charactersBetween = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, index) => String.fromCodePoint(first + index)).join('');
const latinLettersWithAccents = charactersBetween(0x20, 0x7e) + charactersBetween(0xa1, 0xac) + charactersBetween(0xae, 0x17e);
const punctuationAndCurrencySymbols = '‘’“”–—…‹›−→฿₫₱₩₪₹₺€₽₴₦₡₲₵₸₮₭₼₾';
const printedCharacters = latinLettersWithAccents + punctuationAndCurrencySymbols;

const downloadFolder = await mkdtemp(`${tmpdir()}/inter-`);
await writeFile(`${downloadFolder}/Inter.zip`, Buffer.from(await (await fetch(interReleaseUrl)).arrayBuffer()));
execFileSync('unzip', ['-q', `${downloadFolder}/Inter.zip`, 'extras/ttf/*', 'LICENSE.txt', '-d', downloadFolder]);

const advanceWidthsByWeight: Record<string, Record<string, number>> = {};
let unitsPerEm = 0;
for (const [weight, fontName] of Object.entries(fontWeights)) {
  const subset = await subsetFont(await readFile(`${downloadFolder}/extras/ttf/${fontName}.ttf`), printedCharacters, { targetFormat: 'truetype' });
  await writeFile(`assets/fonts/${fontName}.ttf`, subset);
  const font = opentype.parse(subset.buffer.slice(subset.byteOffset, subset.byteOffset + subset.byteLength));
  unitsPerEm = font.unitsPerEm;
  advanceWidthsByWeight[weight] = {};
  for (const character of printedCharacters) {
    const glyph = font.charToGlyph(character);
    if (glyph.index !== 0) advanceWidthsByWeight[weight][character] = glyph.advanceWidth!;
    else if (punctuationAndCurrencySymbols.includes(character)) throw new Error(`${fontName} has no glyph for ${character}`);
  }
  console.log(`${fontName}: ${subset.length} bytes`);
}
await writeFile('assets/fonts/inter-advance-widths.json', JSON.stringify({ unitsPerEm, advanceWidthsByWeight }));
await writeFile('assets/fonts/OFL-Inter.txt', await readFile(`${downloadFolder}/LICENSE.txt`));
await rm(downloadFolder, { recursive: true });
