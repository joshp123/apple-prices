// Writes assets/flags: each country's flag as flag-icons' SVG, each US state's and Canadian province's or territory's flag from Wikimedia Commons
// as a PNG three units wide and two high (they sit on a corner of the country's flag, at most 72 pixels wide on a sharp screen),
// and the licence Commons states for each file.
import { chromium } from 'playwright-core';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';

const stateFlagWidthPixels = 144, stateFlagHeightPixels = 96;
const outputFolder = 'assets/flags';
const countryFlagFolder = 'node_modules/flag-icons/flags/4x3';

const unitedStatesFlagTitles: Record<string, string> = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'the District of Columbia', FL: 'Florida', GA: 'Georgia (U.S. state)', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
const canadaFlagTitles: Record<string, string> = { AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'the Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon' };
const commonsFileTitles: [placeCode: string, fileTitle: string][] = [
  ...Object.entries(unitedStatesFlagTitles).map(([state, title]): [string, string] => [`US-${state}`, `File:Flag of ${title}.svg`]),
  ...Object.entries(canadaFlagTitles).map(([province, title]): [string, string] => [`CA-${province}`, `File:Flag of ${title}.svg`]),
];

await mkdir(outputFolder, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();

// The middle of the flag, as wide and high as a state flag is shown.
async function drawAsStateFlagPng(imageDataUrl: string): Promise<Buffer> {
  const base64 = await page.evaluate(async ([source, width, height]) => {
    const image = new Image();
    image.src = source as string;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width as number;
    canvas.height = height as number;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const drawnWidth = image.naturalWidth * scale, drawnHeight = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - drawnWidth) / 2, (canvas.height - drawnHeight) / 2, drawnWidth, drawnHeight);
    return canvas.toDataURL('image/png').split(',')[1];
  }, [imageDataUrl, stateFlagWidthPixels, stateFlagHeightPixels]);
  return Buffer.from(base64, 'base64');
}

let countryFlagCount = 0;
for (const fileName of await readdir(countryFlagFolder)) {
  const countryCode = fileName.replace('.svg', '').toUpperCase();
  if (countryCode.length !== 2) continue;
  await copyFile(`${countryFlagFolder}/${fileName}`, `${outputFolder}/${countryCode}.svg`);
  countryFlagCount++;
}

const commonsRequestHeaders = { 'User-Agent': 'flag-thumbnail-fetcher/1.0 (one-off build script)' };
const licenceRows: string[] = [];
for (let start = 0; start < commonsFileTitles.length; start += 20) {
  const batch = commonsFileTitles.slice(start, start + 20);
  const query = `action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlheight=${stateFlagHeightPixels * 2}&redirects=1&titles=${encodeURIComponent(batch.map(([, title]) => title).join('|'))}`;
  const { query: answer } = await (await fetch(`https://commons.wikimedia.org/w/api.php?${query}`, { headers: commonsRequestHeaders })).json();
  const renamedTitle = (title: string) => {
    for (const rename of [...(answer.normalized ?? []), ...(answer.redirects ?? [])]) if (rename.from === title) title = rename.to;
    return title;
  };
  for (const [placeCode, fileTitle] of batch) {
    const commonsPage = Object.values<any>(answer.pages).find(candidate => candidate.title === renamedTitle(renamedTitle(fileTitle)));
    const file = commonsPage?.imageinfo?.[0];
    if (!file) throw new Error(`Wikimedia Commons has no ${fileTitle}`);
    const thumbnail = await fetch(file.thumburl, { headers: commonsRequestHeaders });
    if (!thumbnail.ok) throw new Error(`${file.thumburl}: ${thumbnail.status}`);
    await writeFile(`${outputFolder}/${placeCode}.png`, await drawAsStateFlagPng(`data:image/png;base64,${Buffer.from(await thumbnail.arrayBuffer()).toString('base64')}`));
    licenceRows.push(`| ${placeCode} | [${commonsPage.title.replace('File:', '')}](${file.descriptionurl}) | ${file.extmetadata.LicenseShortName.value} |`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
await browser.close();

await writeFile(`${outputFolder}/LICENCES.md`, `<!-- Written by tools/build-flags.ts from the Wikimedia Commons API. -->
# Flag sources

Country flags: [flag-icons](https://github.com/lipis/flag-icons), MIT licence, as its SVG files.

State, province and territory flags: Wikimedia Commons, drawn ${stateFlagWidthPixels} by ${stateFlagHeightPixels} pixels. Licence as Commons states it on each file page:

| Place | File | Licence |
|---|---|---|
${licenceRows.join('\n')}
`);
console.log(`${countryFlagCount} country flags, ${commonsFileTitles.length} state and province flags`);
