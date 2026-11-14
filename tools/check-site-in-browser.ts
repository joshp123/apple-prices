// Uses the site the way a visitor does, in a headless browser, and photographs every state at a phone's and two laptops' sizes, light and dark.
// node tools/check-site-in-browser.ts <address of the running Worker> <folder for the photographs> [only photographs whose names contain this, or "journeys" for none]
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { fromBinary } from '@bufbuild/protobuf';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { PriceSnapshotSchema } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { priceComparison } from '../src/price-comparison.ts';
import { shareCardSvg } from '../src/share-card-svg.ts';
import { selectionFromShareLink } from '../src/share-link.ts';

const [siteAddress, photographFolder, onlyNamesContaining = ''] = process.argv.slice(2);
if (!siteAddress || !photographFolder) throw new Error('Usage: node tools/check-site-in-browser.ts <site address> <photograph folder> [name filter]');
await mkdir(photographFolder, { recursive: true });

const sizes = { laptop: { width: 1512, height: 900 }, 'short-laptop': { width: 1280, height: 720 }, phone: { width: 393, height: 852 } };
type SizeName = keyof typeof sizes;
const laptop = sizes.laptop;
const topMacBookPro = '/macbook-pro-proled-xdr/16in-m5-max-18cpu-40gpu-48gb-memory-2000gb-standard-glass';

const settled = (page: Page) => page.waitForTimeout(350);
const answerText = (page: Page) => page.locator('#answer').innerText();
const placePopUp = (page: Page) => page.locator('.pop-up-of-place');

// Zooms the map the way a visitor does, with the wheel over a place's label, or over the place when it has none.
async function zoomAtPlace(page: Page, placeCode: string, steps: number): Promise<void> {
  const label = page.locator(`.map-label[data-place="${placeCode}"]`);
  const box = (await (await label.isVisible() ? label : page.locator(`path[data-place="${placeCode}"]`)).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let step = 0; step < steps; step++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(120); }
  await settled(page);
}
// Opens a place's pop-up as a visitor does: its label when the map shows one, otherwise the place itself.
// At world zoom a state's outline opens its country, so the United States and Canada are opened by one of theirs not under a label.
async function openPlace(page: Page, placeCode: string): Promise<void> {
  const label = page.locator(`.map-label[data-place="${placeCode}"]`);
  if (await label.isVisible()) return label.click();
  const outlines = ({ US: ['US-TX', 'US-KS', 'US-NE', 'US-SD', 'US-MT'], CA: ['CA-SK', 'CA-MB', 'CA-QC', 'CA-NT'] } as Record<string, string[]>)[placeCode] ?? [placeCode];
  for (const outline of outlines) {
    const box = (await page.locator(`path[data-place="${outline}"]`).boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
    const isUncovered = await page.evaluate(([x, y, outline]) => document.elementFromPoint(x as number, y as number)?.getAttribute('data-place') === outline, [x, y, outline]);
    if (isUncovered) return page.mouse.click(x, y);
  }
  throw new Error(`No uncovered spot to open ${placeCode}`);
}
async function showStatesOf(page: Page, placeCode: 'US' | 'CA'): Promise<void> {
  await openPlace(page, placeCode);
  await page.getByRole('button', { name: placeCode === 'US' ? 'Show the states' : 'Show the provinces' }).click();
  await page.waitForTimeout(700);
}

// [name, address, country the page is opened in, what the visitor does before the photograph]: every state of the page worth seeing.
type Action = (page: Page) => Promise<unknown>;
const pageStates: [name: string, address: string, countryOpenedIn?: string, action?: Action][] = [
  ['01-first-load-netherlands', '/?me=NL'],
  ['02-first-load-california', '/?me=US-CA'],
  ['03-first-load-oregon', '/?me=US-OR'],
  ['04-first-load-united-states-no-state', '/?me=US'],
  ['05-first-load-canada-no-province', '/?me=CA'],
  ['06-first-load-palestine', '/?me=PS'],
  ['07-first-load-place-unknown', '/'],
  ['08-product-list', '/?me=NL', undefined, page => page.getByRole('combobox', { name: 'Product' }).click()],
  ['09-storage-512gb', '/iphone-18-pro/6.3in-512gb?me=NL'],
  ['10-ipad-pro', '/ipad-pro/11in-256gb-wi-fi-standard-glass?me=NL'],
  ['11-ipad-pro-nano-texture', '/ipad-pro/13in-1000gb-wi-fi-cellular-nano-texture-glass?me=NL'],
  ['12-ipad-pro-configuration-list', '/ipad-pro/11in-256gb-wi-fi-standard-glass?me=NL', undefined, page => page.getByRole('combobox', { name: 'Configuration' }).click()],
  ['13-macbook-pro', '/macbook-pro/14in-m6-12cpu-12gpu-16gb-memory-1000gb-standard-glass?me=NL'],
  ['14-macbook-pro-configuration-list', '/macbook-pro/14in-m6-12cpu-12gpu-16gb-memory-1000gb-standard-glass?me=NL', undefined, page => page.getByRole('combobox', { name: 'Configuration' }).click()],
  ['15-vision-pro-not-sold', '/apple-vision-pro/256gb?me=NL'],
  ['16-airtag', '/airtag/1-pack?me=NL'],
  ['17-currency-list', '/?me=NL', undefined, page => page.getByRole('combobox', { name: 'Prices in' }).click()],
  ['18-currency-euro', '/?me=NL&in=EUR'],
  ['19-currency-dong-longest-amounts', `${topMacBookPro}?me=VN&in=VND&vs=KR`],
  ['20-map-world', '/?me=NL'],
  ['21-map-europe', '/?me=NL', undefined, page => zoomAtPlace(page, 'NL', 3)],
  ['22-map-united-states', '/?me=NL', undefined, page => showStatesOf(page, 'US')],
  ['23-map-canada', '/?me=NL', undefined, page => showStatesOf(page, 'CA')],
  ['24-map-asia-pacific', '/?me=NL', undefined, page => zoomAtPlace(page, 'MY', 2)],
  ['25-map-deepest-benelux', '/?me=NL', undefined, page => zoomAtPlace(page, 'NL', 12)],
  ['26-map-deepest-singapore', '/?me=NL', undefined, page => zoomAtPlace(page, 'MY', 12)],
  ['27-pop-up-turkey', '/?me=NL', undefined, page => openPlace(page, 'TR')],
  ['28-pop-up-california', '/?me=NL', undefined, async page => { await showStatesOf(page, 'US'); await openPlace(page, 'US-CA'); }],
  ['29-pop-up-united-states', '/?me=NL', undefined, page => openPlace(page, 'US')],
  ['30-pop-up-palestine', '/?me=NL', undefined, async page => { await zoomAtPlace(page, 'TR', 5); await page.locator('path[data-place="PS"]').click({ force: true }); }],
  ['31-pop-up-of-the-cheapest-place', '/?me=NL', undefined, page => page.locator('.column-cheapest .place-name').click()],
  ['34-comparison-japan', '/?me=NL&vs=JP'],
  ['35-compare-list', '/?me=NL', undefined, page => page.getByRole('button', { name: 'Compare with a place' }).click()],
  ['36-visitor-place-list', '/?me=NL', undefined, page => page.getByRole('button', { name: /^You are in Netherlands/ }).click()],
  ['37-choose-your-state', '/?me=US', undefined, page => page.getByRole('button', { name: 'Choose your state' }).click()],
  ['38-california-compared-with-ontario', '/?me=US-CA&vs=CA-ON'],
  ['39-share', '/?me=NL&vs=JP', undefined, page => page.getByRole('button', { name: 'Share' }).click()],
  ['40-share-palestine', '/?me=PS', undefined, page => page.getByRole('button', { name: 'Share' }).click()],
  ['43-prices-include-tax', '/?me=NL', undefined, page => page.getByRole('button', { name: 'Including tax' }).click()],
  ['44-california-sales-tax', '/?me=US-CA', undefined, page => page.getByRole('button', { name: /^Including [\d.]+% sales tax/ }).click()],
  ['48-shared-link-opened-in-another-country', '/iphone-18-pro/6.3in-256gb?me=NL', 'DE'],
];
const shareCards: [string, string][] = [
  ['card-01-netherlands', '/share-card/iphone-18-pro/6.3in-256gb.png?me=NL'],
  ['card-02-with-comparison', '/share-card/iphone-18-pro/6.3in-256gb.png?me=NL&vs=JP'],
  ['card-03-palestine', '/share-card/iphone-18-pro/6.3in-256gb.png?me=PS'],
  ['card-04-california-and-ontario', '/share-card/iphone-18-pro/6.3in-256gb.png?me=US-CA&vs=CA-ON'],
  ['card-05-united-states-no-state', '/share-card/iphone-18-pro/6.3in-256gb.png?me=US&vs=NL'],
  ['card-06-oregon', '/share-card/iphone-18-pro/6.3in-256gb.png?me=US-OR'],
  ['card-07-macbook-pro-dong', `/share-card${topMacBookPro}.png?me=VN&in=VND&vs=KR`],
  ['card-08-ipad-pro-euros', '/share-card/ipad-pro/11in-256gb-wi-fi-standard-glass.png?me=NL&in=EUR&vs=GB'],
  ['card-09-airtag', '/share-card/airtag/1-pack.png?me=NL'],
  ['card-10-no-visitor', '/share-card/iphone-18-pro/6.3in-256gb.png'],
  ['card-11-macbook-pro-california-and-united-kingdom', '/share-card/macbook-pro/14in-m6-12cpu-12gpu-16gb-memory-1000gb-standard-glass.png?me=US-CA&vs=GB'],
];

const failures: string[] = [];
function check(what: string, isTrue: boolean, detail = ''): void {
  console.log(`${isTrue ? 'ok  ' : 'FAIL'} ${what}${isTrue || !detail ? '' : `: ${detail}`}`);
  if (!isTrue) failures.push(what);
}

const browser: Browser = await chromium.launch();

// A page whose visitor's connection comes from the given country, as /api/whereami would say on the real site.
async function openPage(context: BrowserContext, address: string, visitorCountry: string | null = null): Promise<Page> {
  const page = await context.newPage();
  page.on('pageerror', problem => check(`no script error at ${address}`, false, problem.message));
  await page.route('**/api/whereami', route => route.fulfill({ json: { country: visitorCountry } }));
  await page.goto(siteAddress + address);
  await page.waitForFunction(() => document.documentElement.dataset.page !== 'loading');
  await page.waitForLoadState('networkidle');
  return page;
}
const newContext = (size: SizeName, colorScheme: 'light' | 'dark' = 'light', extra: Parameters<Browser['newContext']>[0] = {}) => browser.newContext({
  viewport: sizes[size], deviceScaleFactor: 2, colorScheme, reducedMotion: 'reduce', ...(size === 'phone' ? { hasTouch: true, isMobile: true } : {}), ...extra,
});
const laptopContext = () => newContext('laptop', 'light', { acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });

// Each row of the answer (what the column is, the place, the local money, the note, the bar) has its first line of text, or its bar,
// at the same height in every column beside it.
async function misalignedRows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const firstLineTop = (part: Element) => {
      if (part.matches('.column-meter')) return Math.round(part.getBoundingClientRect().top);
      const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT), tops: number[] = [];
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent!.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        tops.push(...[...range.getClientRects()].filter(line => line.height > 0).map(line => line.top));
      }
      return Math.round(Math.min(...tops));
    };
    for (const row of ['role', 'place', 'local', 'note', 'meter']) {
      const tops = [...document.querySelectorAll(`.column-${row}`)].map(part => ({ top: firstLineTop(part) })).filter(({ top }) => Number.isFinite(top));
      const byVisualRow = Object.groupBy(tops, ({ top }) => String(Math.round(top / 60)));
      for (const sameRow of Object.values(byVisualRow)) if (new Set(sameRow!.map(({ top }) => top)).size > 1) problems.push(`${row}: ${sameRow!.map(({ top }) => top).join(', ')}`);
    }
    return problems;
  });
}

async function photographEveryState(): Promise<void> {
  for (const sizeName of Object.keys(sizes) as SizeName[]) for (const colorScheme of ['light', 'dark'] as const) {
    const context = await newContext(sizeName, colorScheme);
    for (const [name, address, countryOpenedIn, action] of pageStates) {
      const photographName = `${sizeName}-${colorScheme}-${name}`;
      if (!photographName.includes(onlyNamesContaining)) continue;
      const page = await openPage(context, address, countryOpenedIn);
      await page.evaluate(() => Promise.all([...document.images].map(image => image.decode().catch(() => {}))));
      await settled(page);
      if (colorScheme === 'light') {
        const overflow = await page.evaluate(() => ({ across: document.documentElement.scrollWidth - innerWidth, down: document.documentElement.scrollHeight - innerHeight }));
        check(`${sizeName} ${name} does not scroll sideways`, overflow.across <= 0, `${overflow.across}px`);
        check(`${sizeName} ${name} fits one screen`, overflow.down <= 0, `${overflow.down}px`);
        const problems = await misalignedRows(page);
        check(`${sizeName} ${name}: the answer's rows line up`, !problems.length, problems.join('; '));
        const mapHeight = await page.locator('#map').evaluate(map => map.getBoundingClientRect().height);
        check(`${sizeName} ${name}: the map has room`, mapHeight >= (sizeName === 'phone' ? 300 : 380), `${mapHeight}px`);
      }
      if (action) {
        await action(page);
        await settled(page);
        await page.evaluate(() => Promise.all([...document.images].map(image => image.decode().catch(() => {}))));
      }
      await page.screenshot({ path: `${photographFolder}/${photographName}.png` });
      await page.close();
    }
    await context.close();
  }
}

async function photographShareCards(): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 400, height: 225 }, deviceScaleFactor: 2 });
  for (const [name, address] of shareCards) {
    if (!name.includes(onlyNamesContaining)) continue;
    const response = await fetch(siteAddress + address), bytes = Buffer.from(await response.arrayBuffer());
    check(`${name} is a PNG from the Worker`, response.ok && response.headers.get('content-type') === 'image/png' && bytes.subarray(1, 4).toString() === 'PNG', `${response.status}`);
    await writeFile(`${photographFolder}/${name}.png`, bytes);
    const page = await context.newPage();
    await page.setContent(`<body style="margin:0"><img src="data:image/png;base64,${bytes.toString('base64')}" style="width:400px;display:block">`);
    await page.screenshot({ path: `${photographFolder}/${name}-at-400-wide.png` });
    await page.close();
  }
  await context.close();
}

// The card is seen about 400 pixels wide, a quarter of its size: every line of it must be 12 pixels there, 48 on the card.
function checkShareCardText(): void {
  const snapshot = fromBinary(PriceSnapshotSchema, readFileSync('data/price-snapshot.binpb'));
  for (const [name, address] of shareCards) {
    const link = new URL(address.replace('/share-card', '').replace('.png', ''), siteAddress);
    const svg = shareCardSvg(priceComparison(snapshot, selectionFromShareLink(snapshot, link)), { productPhoto: { imageName: '', productBox: [0, 0, 800, 800], onOpaqueBackdrop: false }, productPhotoDataUrl: '', flagDataUrls: {} });
    const fontSizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map(match => Number(match[1]));
    check(`${name} has no line under 12 pixels at 400 wide`, Math.min(...fontSizes) >= 48, `smallest ${Math.min(...fontSizes)}`);
  }
}

const price = (page: Page, role: string) => page.locator(`.column-${role} .column-price`).innerText();

async function journeyByMouse(): Promise<void> {
  const context = await laptopContext();
  const page = await openPage(context, '/', 'NL');
  check('the visitor’s country comes from /api/whereami', (await answerText(page)).includes('Netherlands') && (await price(page, 'visitor')) === '$1,633', await answerText(page));
  check('the address carries the visitor’s place', page.url().includes('me=NL'), page.url());

  await page.getByRole('combobox', { name: 'Product' }).click();
  await page.getByRole('option', { name: /^iPad Pro/ }).click();
  check('choosing a product changes the answer', (await page.getByRole('combobox', { name: 'Product' }).innerText()).includes('iPad Pro') && page.url().includes('/ipad-pro/'), page.url());
  await page.getByRole('combobox', { name: 'Configuration' }).click();
  await page.getByRole('option', { name: /^13-inch, M5, 1TB, Wi-Fi, Nano-texture glass/ }).click();
  check('the address names the configuration', page.url().includes('/ipad-pro/13in-1000gb-wi-fi-nano-texture-glass'), page.url());

  await page.getByRole('combobox', { name: 'Prices in' }).click();
  await page.getByRole('option', { name: /^Euros/ }).click();
  check('switching currency shows euros first', /^€[\d,]+$/.test(await price(page, 'visitor')) && page.url().includes('in=EUR'), await price(page, 'visitor'));

  await page.getByRole('button', { name: 'Compare with a place' }).click();
  await page.getByRole('combobox', { name: 'Search countries, states and provinces' }).fill('ontario');
  await page.getByRole('option', { name: /^Ontario, Canada/ }).click();
  check('search finds a province directly and compares with it', (await page.locator('.column-compared').innerText()).includes('Ontario') && page.url().includes('vs=CA-ON'), page.url());
  await page.getByRole('button', { name: /^Compared with Ontario/ }).click();
  await page.getByRole('option', { name: 'No comparison' }).click();
  check('the comparison can be removed', (await page.locator('.column-compared').innerText()).includes('Choose a place') && !page.url().includes('vs='));

  const landBefore = await page.locator('.map-land').getAttribute('transform');
  await zoomAtPlace(page, 'TR', 1);
  check('the wheel over a label zooms the map', await page.locator('.map-land').getAttribute('transform') !== landBefore);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.waitForTimeout(500);
  await page.locator('.map-label[data-place="TR"]').click();
  check('a place on the map opens its pop-up', (await placePopUp(page).innerText()).includes('Turkey'));
  const applePage = await placePopUp(page).locator('.pop-up-link').getAttribute('href');
  check('the pop-up links to Apple’s own page for the product', /^https:\/\/www\.apple\.com\/tr\//.test(applePage ?? ''), applePage ?? '');
  await page.getByRole('button', { name: 'Compare with you' }).click();
  check('the pop-up fixes the place as the comparison', (await page.locator('.column-compared').innerText()).includes('Turkey') && page.url().includes('vs=TR') && !(await placePopUp(page).isVisible()));

  const cheapestName = await page.locator('.column-cheapest .place-words').innerText();
  await page.locator('.column-cheapest .place-name').click();
  check('the cheapest place’s name opens its pop-up on the map', await placePopUp(page).isVisible() && (await placePopUp(page).locator('.pop-up-title').innerText()) === cheapestName, cheapestName);
  await page.keyboard.press('Escape');

  // Back undoes each choice of prices in turn.
  await page.goBack(); await settled(page);
  check('Back removes the comparison with Turkey', !page.url().includes('vs=TR') && (await page.locator('.column-compared').innerText()).includes('Choose a place'), page.url());
  await page.goBack(); await page.goBack(); await settled(page);
  check('Back returns to euros without Ontario', page.url().includes('in=EUR') && !page.url().includes('vs='), page.url());
  await page.goBack(); await settled(page);
  check('Back returns to US dollars', !page.url().includes('in=EUR') && (await price(page, 'visitor')).startsWith('$'), page.url());
  await page.goBack(); await page.goBack(); await settled(page);
  check('Back returns to the first product', page.url().includes('/iphone-18-pro/') && (await price(page, 'visitor')) === '$1,633', page.url());
  await page.goForward(); await settled(page);
  check('Forward returns to iPad Pro', page.url().includes('/ipad-pro/') && (await page.getByRole('combobox', { name: 'Product' }).innerText()).includes('iPad Pro'), page.url());

  // Sharing.
  await page.goto(`${siteAddress}/?me=NL&vs=JP&in=EUR`);
  await page.waitForFunction(() => document.documentElement.dataset.page === 'ready');
  await page.getByRole('button', { name: 'Share' }).click();
  const shareAddress = `${siteAddress}/iphone-18-pro/6.3in-256gb?me=NL&vs=JP&in=EUR`;
  const postLink = async () => new URL((await page.locator('#post-on-x').getAttribute('href'))!);
  check('the post links to this exact comparison', (await postLink()).searchParams.get('url') === shareAddress, (await postLink()).searchParams.get('url') ?? '');
  await page.locator('#share-text').fill('  My own words, kept as typed  ');
  check('the post carries the visitor’s words exactly', (await postLink()).searchParams.get('text') === '  My own words, kept as typed  ');
  await page.locator('#share-text').fill('');
  check('an empty post stays empty', !(await postLink()).searchParams.has('text') && (await postLink()).searchParams.get('url') === shareAddress);
  check('the picture in the dialog is the Worker’s card', await page.locator('.share-card').evaluate(async (image: HTMLImageElement) => { await image.decode(); return image.naturalWidth === 1600; }));
  await page.getByRole('button', { name: 'Copy link' }).click();
  check('Copy link puts the link on the clipboard', await page.evaluate(() => navigator.clipboard.readText()) === shareAddress);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Save picture' }).click()]);
  await download.saveAs(`${photographFolder}/downloaded-share-card.png`);
  check('Save picture downloads a PNG', download.suggestedFilename() === 'apple-prices-iphone-18-pro.png');
  await page.keyboard.press('Escape');
  await settled(page);
  check('Escape closes the share dialog', !(await page.locator('.dialog').isVisible()));
  await page.getByRole('button', { name: 'Share' }).click();
  check('the typed words are kept for next time', (await page.locator('#share-text').inputValue()) === '');
  await page.keyboard.press('Escape');

  // The share link's own page carries the tags X reads.
  const sharedHtml = await (await fetch(shareAddress)).text();
  check('the shared link’s preview picture is its own card', sharedHtml.includes(`<meta name="twitter:image" content="${siteAddress}/share-card/iphone-18-pro/6.3in-256gb.png?me=NL&amp;vs=JP&amp;in=EUR">`) && sharedHtml.includes('summary_large_image'));
  check('the page has its answer without JavaScript', sharedHtml.includes('costs €1,479 in the Netherlands'));
  await context.close();
}

async function journeyByKeyboard(): Promise<void> {
  const context = await laptopContext();
  const page = await openPage(context, '/?me=NL');
  const focusedWords = () => page.evaluate(() => (document.activeElement as HTMLElement).innerText || document.activeElement!.getAttribute('aria-label') || '');
  const focusedName = () => page.evaluate(() => document.activeElement!.getAttribute('aria-label') ?? document.activeElement!.getAttribute('aria-labelledby') ?? '');
  await page.keyboard.press('Tab');
  check('the first Tab reaches the skip link', (await focusedWords()).includes('Skip to the prices'));
  await page.keyboard.press('Tab');
  check('the next Tab reaches the product', (await focusedWords()).includes('iPhone 18 Pro'));
  await page.keyboard.press('Enter');
  await settled(page);
  check('Enter opens the product list', await page.getByRole('listbox', { name: 'Product' }).isVisible());
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await settled(page);
  check('arrow keys and Enter choose a product', page.url().includes('/iphone-18-pro-max/') && (await price(page, 'visitor')).startsWith('$'), page.url());
  check('focus returns to the product', (await focusedWords()).includes('iPhone 18 Pro Max'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await settled(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await settled(page);
  check('arrow keys choose the next storage size', page.url().includes('6.9in-512gb'), page.url());
  await page.keyboard.press('Enter');
  await settled(page);
  await page.keyboard.press('Escape');
  await settled(page);
  check('Escape closes a list and returns focus to what opened it', !(await page.getByRole('listbox', { name: 'Configuration' }).isVisible()) && (await focusedWords()).includes('512GB'), await focusedName());
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  check('Tab reaches the visitor’s place', (await focusedName()).startsWith('You are in Netherlands'), await focusedName());
  await page.keyboard.press('Enter');
  await settled(page);
  await page.keyboard.type('japan');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await settled(page);
  check('typing in the place list and Enter choose a place', page.url().includes('me=JP'), page.url());
  await page.locator('.map-drawing').focus();
  const landBefore = await page.locator('.map-land').getAttribute('transform');
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowRight');
  check('plus and arrow keys zoom and move the map', await page.locator('.map-land').getAttribute('transform') !== landBefore);
  check('the map key shows the cheapest and dearest price', /^\$[\d,]+\$[\d,]+NopricefromApple$/.test((await page.locator('.map-key').innerText()).replace(/\s/g, '')), await page.locator('.map-key').innerText());
  await context.close();
}

async function journeysAboutPlace(): Promise<void> {
  const portlandOregon = { latitude: 45.52, longitude: -122.68 }, toronto = { latitude: 43.65, longitude: -79.38 };
  const withLocation = await browser.newContext({ viewport: laptop, reducedMotion: 'reduce', geolocation: portlandOregon, permissions: ['geolocation'] });
  let page = await openPage(withLocation, '/', 'US');
  check('a visitor in the United States sees the range of its states and is asked for theirs', (await price(page, 'visitor')) === '$1,199 to $1,322' && (await answerText(page)).includes('Choose your state'), await answerText(page));
  await page.locator('.map-label[data-place="US"]').click();
  check('the United States’ pop-up says its sales tax is the population-weighted average', (await placePopUp(page).innerText()).includes('population-weighted average'));
  await page.keyboard.press('Escape');
  const requestsBefore: string[] = [];
  page.on('request', request => requestsBefore.push(request.url()));
  await page.locator('.column-visitor').getByRole('button', { name: 'Use my location' }).click();
  await page.waitForURL(/me=US-OR/);
  check('Use my location finds the state', page.url().includes('me=US-OR') && (await answerText(page)).includes('No sales tax'));
  check('the position is sent nowhere', !requestsBefore.some(address => address.includes('45.5') || address.includes('122.6')), requestsBefore.join(' '));
  await withLocation.close();
  const inToronto = await browser.newContext({ viewport: laptop, reducedMotion: 'reduce', geolocation: toronto, permissions: ['geolocation'] });
  page = await openPage(inToronto, '/?me=NL');
  await page.getByRole('button', { name: /^You are in Netherlands/ }).click();
  await page.locator('#visitor-place').getByRole('button', { name: 'Use my location' }).click();
  await page.waitForURL(/me=CA-ON/);
  await settled(page);
  check('Use my location finds a Canadian province from the place list', (await answerText(page)).includes('Ontario') && !(await page.locator('.list-of-places').first().isVisible()));
  await inToronto.close();

  const withoutLocation = await browser.newContext({ viewport: laptop, reducedMotion: 'reduce', permissions: [] });
  page = await openPage(withoutLocation, '/', 'US');
  await page.locator('.column-visitor').getByRole('button', { name: 'Use my location' }).click();
  await page.waitForFunction(() => document.querySelector('#answer')!.textContent!.includes('did not share'));
  check('a refused location says so and offers the list', (await answerText(page)).includes('Your browser did not share your location. Choose your place from the list.'));
  await page.getByRole('button', { name: 'Choose your state' }).click();
  await page.getByRole('option', { name: /^California, United States/ }).click();
  check('the state can be chosen from the list instead', page.url().includes('me=US-CA') && (await price(page, 'visitor')) === '$1,322', page.url());
  await page.getByRole('button', { name: /^Including [\d.]+% sales tax/ }).click();
  check('a state’s tax details say it is the population-weighted average', (await page.locator('.pop-up-of-tax').innerText()).includes('(population-weighted average)'));
  await page.keyboard.press('Escape');

  page = await openPage(withoutLocation, '/iphone-18-pro/6.3in-256gb?me=NL', 'DE');
  await settled(page);
  check('a shared link opened in another country shows what was shared', page.url().includes('me=NL') && !page.url().includes('DE') && (await answerText(page)).includes('Shared place')
    && (await price(page, 'visitor')) === '$1,633' && !/\byou\b/i.test(await answerText(page)), `${page.url()} ${await answerText(page)}`);
  await page.getByRole('button', { name: 'See the price in Germany' }).click();
  check('one action shows the opener’s own price beside the shared place', page.url().includes('me=DE') && page.url().includes('vs=NL') && (await page.locator('.column-visitor').innerText()).startsWith('You')
    && (await page.locator('.column-compared').innerText()).includes('Netherlands'), page.url());
  await page.goBack(); await settled(page);
  check('Back returns to the shared view', page.url().includes('me=NL') && !page.url().includes('vs='), page.url());
  page = await openPage(withoutLocation, '/', 'IL');
  check('Palestine: the page says prices were not found', (await answerText(page)).includes('We couldn’t find prices in occupied Palestine.') && (await answerText(page)).includes('Palestine'));
  page = await openPage(withoutLocation, '/?me=NL');
  await page.getByRole('button', { name: 'Compare with a place' }).click();
  await page.getByRole('combobox', { name: 'Search countries, states and provinces' }).fill('pales');
  check('a place with no price is not offered as a comparison', await page.getByRole('option', { name: /Palestine/ }).count() === 0 && await page.getByText('No place with that name.').isVisible());
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^You are in Netherlands/ }).click();
  await page.getByRole('combobox', { name: 'Search countries, states and provinces' }).fill('pales');
  await page.getByRole('option', { name: /Palestine/ }).click();
  check('a place with no price can still be where the visitor is', page.url().includes('me=PS'));
  await withoutLocation.close();
}

async function journeysOnAPhone(): Promise<void> {
  const context = await newContext('phone');
  const page = await openPage(context, '/?me=NL');
  await page.getByRole('combobox', { name: 'Product' }).click();
  await settled(page);
  check('on a phone a list opens as a sheet', await page.locator('#product-select ui-select-content').getAttribute('data-presentation') === 'sheet');
  await page.getByRole('option', { name: /^iPhone Air/ }).click();
  await settled(page);
  check('choosing from the sheet changes the product', page.url().includes('/iphone-air/'), page.url());
  await page.getByRole('button', { name: 'Compare with a place' }).click();
  await settled(page);
  await page.getByRole('combobox', { name: 'Search countries, states and provinces' }).fill('japan');
  await page.getByRole('option', { name: /^Japan/ }).click();
  await settled(page);
  check('on a phone the place list searches and compares', page.url().includes('vs=JP'), page.url());
  await page.locator('.map-label[data-place="JP"]').click();
  await settled(page);
  check('on a phone the map pop-up opens as a sheet', await page.locator('.pop-up-of-place').getAttribute('data-presentation') === 'sheet');
  await page.screenshot({ path: `${photographFolder}/phone-light-50-pop-up-sheet.png` });
  await context.close();
}

async function journeysWhenThingsFail(): Promise<void> {
  const context = await laptopContext();
  const notFound = await fetch(`${siteAddress}/iphone-18-pro/no-such-configuration`);
  check('an address with no page answers 404 with a way home', notFound.status === 404 && (await notFound.text()).includes('href="/"'));
  check('a card for no product answers 404', (await fetch(`${siteAddress}/share-card/no-such-product/x.png`)).status === 404);
  const page = await context.newPage();
  await page.route('**/data/price-snapshot-*', route => route.abort());
  await page.goto(`${siteAddress}/?me=NL`);
  await page.waitForFunction(() => document.documentElement.dataset.page === 'failed');
  check('prices that do not load say so and offer to try again', (await answerText(page)).includes('The prices did not load.') && await page.getByRole('button', { name: 'Try again' }).isVisible());
  await page.screenshot({ path: `${photographFolder}/laptop-light-45-prices-did-not-load.png` });
  await page.unroute('**/data/price-snapshot-*');
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.page === 'ready');
  check('Try again loads the prices', (await price(page, 'visitor')) === '$1,633');

  const withoutScript = await browser.newContext({ viewport: laptop, javaScriptEnabled: false });
  const plainPage = await withoutScript.newPage();
  await plainPage.goto(`${siteAddress}/?me=NL`);
  check('without JavaScript the answer is still on the page', (await plainPage.locator('#answer').innerText()).includes('costs $1,633 in the Netherlands'));
  await plainPage.screenshot({ path: `${photographFolder}/laptop-light-46-without-javascript.png` });

  const largeText = await newContext('phone');
  const largeTextPage = await openPage(largeText, `${topMacBookPro}?me=VN&in=VND&vs=KR`);
  await largeTextPage.addStyleTag({ content: 'html { font-size: 130%; } body { zoom: 1.3; }' });
  await settled(largeTextPage);
  check('enlarged text on a phone scrolls down, never sideways', await largeTextPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check('enlarged text on a phone clips no control', await largeTextPage.evaluate(() => [...document.querySelectorAll('.bar button, .answer button, .map-zoom button')]
    .every(control => { const box = control.getBoundingClientRect(); return box.width === 0 || (box.left >= -1 && box.right <= document.documentElement.clientWidth + 1); })));
  await largeTextPage.screenshot({ path: `${photographFolder}/phone-light-47-enlarged-text.png`, fullPage: true });
  await Promise.all([context.close(), withoutScript.close(), largeText.close()]);
}

if (!onlyNamesContaining || onlyNamesContaining === 'journeys') {
  checkShareCardText();
  await journeyByMouse();
  await journeyByKeyboard();
  await journeysAboutPlace();
  await journeysOnAPhone();
  await journeysWhenThingsFail();
}
if (onlyNamesContaining !== 'journeys') {
  await photographShareCards();
  await photographEveryState();
}
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED:\n${failures.join('\n')}` : '\nEverything checked is working.');
process.exit(failures.length ? 1 : 0);
