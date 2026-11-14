// Uses the site the way a visitor does, in a headless browser, and photographs every state.
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

const laptop = { width: 1512, height: 900 }, phone = { width: 390, height: 844 };
const topMacBookPro = '/macbook-pro-proled-xdr/16in-m5-max-18cpu-40gpu-48gb-memory-2000gb-standard-glass';
// [name, address]: every state of the page worth seeing.
const pageStates: [name: string, address: string, countryOpenedIn?: string][] = [
  ['01-first-load-netherlands', '/?me=NL'],
  ['02-first-load-california', '/?me=US-CA'],
  ['03-first-load-oregon', '/?me=US-OR'],
  ['04-first-load-united-states-no-state', '/?me=US'],
  ['05-first-load-canada-no-province', '/?me=CA'],
  ['06-first-load-palestine', '/?me=PS'],
  ['07-first-load-place-unknown', '/'],
  ['08-product-list', '/?me=NL&panel=product'],
  ['09-storage-512gb', '/iphone-18-pro/6.3in-512gb?me=NL'],
  ['10-ipad-pro', '/ipad-pro/11in-256gb-wi-fi-standard-glass?me=NL'],
  ['11-ipad-pro-nano-texture', '/ipad-pro/13in-1000gb-wi-fi-cellular-nano-texture-glass?me=NL'],
  ['12-ipad-pro-configuration-panel', '/ipad-pro/11in-256gb-wi-fi-standard-glass?me=NL&panel=configuration'],
  ['13-macbook-pro', '/macbook-pro/14in-m6-12cpu-12gpu-16gb-memory-1000gb-standard-glass?me=NL'],
  ['14-macbook-pro-configurations', '/macbook-pro/14in-m6-12cpu-12gpu-16gb-memory-1000gb-standard-glass?me=NL&panel=configuration'],
  ['15-vision-pro-not-sold', '/apple-vision-pro/256gb?me=NL'],
  ['16-airtag', '/airtag/1-pack?me=NL'],
  ['17-currency-list', '/?me=NL&panel=currency'],
  ['18-currency-euro', '/?me=NL&in=EUR'],
  ['19-currency-dong-longest-amounts', `${topMacBookPro}?me=VN&in=VND&vs=KR`],
  ['20-map-world', '/?me=NL&area=world'],
  ['21-map-europe', '/?me=NL&area=europe'],
  ['22-map-united-states', '/?me=NL&area=united-states'],
  ['23-map-canada', '/?me=NL&area=canada'],
  ['24-map-asia-pacific', '/?me=NL&area=asia-pacific'],
  ['25-map-deepest-us-north-east', '/?me=NL&area=us-north-east'],
  ['26-map-deepest-benelux', '/?me=NL&area=benelux'],
  ['27-map-deepest-hong-kong-macau', '/?me=NL&area=pearl-river-delta'],
  ['28-map-deepest-singapore', '/?me=NL&area=singapore'],
  ['29-pop-up-turkey', '/?me=NL&area=europe&place=TR'],
  ['30-pop-up-california', '/?me=NL&area=united-states&place=US-CA'],
  ['31-pop-up-united-states', '/?me=NL&place=US'],
  ['32-pop-up-palestine', '/?me=NL&area=eastern-mediterranean&place=PS'],
  ['33-pop-up-from-price-line', '/?me=NL&place=JP&from=price-line'],
  ['34-comparison-japan', '/?me=NL&vs=JP'],
  ['35-compare-list', '/?me=NL&panel=compared-place'],
  ['36-visitor-place-list', '/?me=NL&panel=visitor-place'],
  ['37-choose-your-state', '/?me=US&panel=visitor-place&list=US'],
  ['38-california-compared-with-ontario', '/?me=US-CA&vs=CA-ON'],
  ['39-share', '/?me=NL&vs=JP&panel=share'],
  ['40-share-palestine', '/?me=PS&panel=share'],
  ['41-price-line-states-and-provinces', '/?me=US-CA&line=states-and-provinces'],
  ['42-all-prices', '/?me=NL&panel=all-prices'],
  ['43-prices-include-tax', '/?me=NL&panel=about-prices'],
  ['48-shared-link-opened-in-another-country', '/iphone-18-pro/6.3in-256gb?me=NL', 'DE'],
  ['49-places-at-one-price', '/?me=NL&panel=places-at-one-price&at=BE+FR+SE+IE+IT+PT+HU+FI+NO'],
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
const settled = (page: Page) => page.waitForTimeout(350);
const answerText = (page: Page) => page.locator('#answer').innerText();
const laptopContext = () => browser.newContext({ viewport: laptop, deviceScaleFactor: 2, reducedMotion: 'reduce', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const phoneContext = () => browser.newContext({ viewport: phone, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

const answerShowsEverything = (page: Page) => page.locator('#answer').evaluate(answer => answer.scrollHeight <= answer.clientHeight);
const priceLineFlagsAreApart = (page: Page) => page.locator('.hanging-flags').evaluate(box => {
  const boxes = [...box.querySelectorAll('.hanging-flag .flag, .hanging-flag .span-of-prices, .count-of-places')].map(each => ({ owner: each.closest('button'), box: each.getBoundingClientRect() }));
  return boxes.every((a, index) => boxes.slice(index + 1).every(b => a.owner === b.owner || a.box.right <= b.box.left + 0.5 || b.box.right <= a.box.left + 0.5 || a.box.bottom <= b.box.top + 0.5 || b.box.bottom <= a.box.top + 0.5));
});

async function photographEveryState(): Promise<void> {
  for (const [sizeName, newContext] of [['laptop', laptopContext], ['phone', phoneContext]] as const) {
    const context = await newContext();
    for (const [name, address, countryOpenedIn] of pageStates) {
      if (!`${sizeName}-${name}`.includes(onlyNamesContaining)) continue;
      const page = await openPage(context, address, countryOpenedIn);
      await page.evaluate(() => Promise.all([...document.images].map(image => image.decode().catch(() => {}))));
      await settled(page);
      const overflow = await page.evaluate(() => ({ across: document.documentElement.scrollWidth - innerWidth, down: document.documentElement.scrollHeight - innerHeight }));
      check(`${sizeName} ${name} does not scroll sideways`, overflow.across <= 0, `${overflow.across}px`);
      if (sizeName === 'laptop') {
        check(`${sizeName} ${name} fits one screen`, overflow.down <= 0, `${overflow.down}px`);
        check(`${sizeName} ${name} shows the whole answer`, await answerShowsEverything(page));
        check(`${sizeName} ${name} has no flag over another on the price line`, await priceLineFlagsAreApart(page));
      }
      // A phone page may be longer than the screen; a panel over it is photographed as the visitor sees it, on the screen.
      const hasPanelOpen = /panel=|place=/.test(address);
      await page.screenshot({ path: `${photographFolder}/${sizeName}-${name}.png`, fullPage: sizeName === 'phone' && !hasPanelOpen });
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
    console.log(`     rendered in ${response.headers.get('server-timing')}`);
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

async function journeyByMouse(): Promise<void> {
  const context = await laptopContext();
  const page = await openPage(context, '/', 'NL');
  check('the visitor’s country comes from /api/whereami', (await answerText(page)).includes('Netherlands') && (await answerText(page)).includes('$1,633'), await answerText(page));
  check('the address carries the visitor’s place', page.url().includes('me=NL'), page.url());

  await page.getByRole('button', { name: 'iPhone 18 Pro', exact: true }).click();
  await page.getByRole('option', { name: /^iPad Pro/ }).click();
  check('choosing a product changes the answer', (await answerText(page)).includes('iPad Pro costs you'));
  await page.getByRole('button', { name: /^Configuration:/ }).click();
  await page.getByRole('radio', { name: '13-inch' }).click();
  await page.getByRole('radio', { name: 'Nano-texture glass' }).click();
  check('a choice that changes another spec says so', /Storage changed to 1TB/.test(await page.locator('.menu-note').innerText()), await page.locator('.menu-note').innerText());
  await page.keyboard.press('Escape');
  check('the address names the configuration', page.url().includes('/ipad-pro/13in-1000gb-wi-fi-nano-texture-glass'), page.url());

  await page.getByRole('button', { name: /^Prices in / }).click();
  await page.getByRole('option', { name: /euros/ }).click();
  check('switching currency shows euros first', /€[\d,]+/.test(await page.locator('.lead-price').innerText()) && page.url().includes('in=EUR'));

  await page.getByRole('button', { name: /Choose a place/ }).click();
  await page.getByRole('searchbox').fill('ontario');
  await page.getByRole('option', { name: /Ontario, Canada/ }).click();
  check('search finds a province directly and compares with it', (await answerText(page)).includes('Compared with') && (await answerText(page)).includes('Ontario') && page.url().includes('vs=CA-ON'));
  await page.getByRole('button', { name: /^Compared with Ontario/ }).click();
  await page.getByRole('option', { name: 'No comparison' }).click();
  check('the comparison can be removed', !(await answerText(page)).includes('Compared with'));

  await page.locator('.map-label[data-place="TR"]').click();
  check('a place on the map opens its pop-up', (await page.locator('.pop-up').innerText()).includes('Turkey'));
  const applePage = await page.locator('.pop-up-link').getAttribute('href');
  check('the pop-up links to Apple’s own page for the product', /^https:\/\/www\.apple\.com\/tr\//.test(applePage ?? ''), applePage ?? '');
  await page.getByRole('button', { name: 'Compare with you' }).click();
  check('the pop-up fixes the place as the comparison', (await answerText(page)).includes('Turkey') && page.url().includes('vs=TR'));

  // Back undoes each choice of prices in turn.
  await page.goBack(); await settled(page);
  check('Back removes the comparison with Turkey', !page.url().includes('vs=TR') && !(await answerText(page)).includes('Compared with'));
  await page.goBack(); await page.goBack(); await settled(page);
  check('Back returns to euros without Ontario', page.url().includes('in=EUR') && !page.url().includes('vs='), page.url());
  await page.goBack(); await settled(page);
  check('Back returns to US dollars', !page.url().includes('in=EUR') && (await page.locator('.lead-price').innerText()).startsWith('$'), page.url());
  await page.goBack(); await page.goBack(); await page.goBack(); await settled(page);
  check('Back returns to the first product', page.url().includes('/iphone-18-pro/') && (await answerText(page)).includes('iPhone 18 Pro costs you'), page.url());
  await page.goForward(); await settled(page);
  check('Forward returns to iPad Pro', (await answerText(page)).includes('iPad Pro costs you'));

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
  check('closing the dialog keeps the typed words for next time', await page.locator('.dialog').count() === 0);

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
  await page.keyboard.press('Tab');
  check('the first Tab reaches the skip link', (await focusedWords()).includes('Skip to the prices'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  check('Enter opens the product list with the chosen product in focus', (await focusedWords()).startsWith('iPhone 18 Pro'));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check('arrow keys and Enter choose a product', (await answerText(page)).includes('iPhone 18 Pro Max costs you'));
  check('focus returns to the product picker', (await focusedWords()).includes('iPhone 18 Pro Max'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  check('arrow keys choose the next storage size', page.url().includes('512gb') && (await focusedWords()) === '512GB', page.url());
  await page.keyboard.press('Escape');
  check('Escape closes a list and returns focus to what opened it', await page.locator('.menu').count() === 0 && /^Configuration:/.test(await page.evaluate(() => document.activeElement!.getAttribute('aria-label') ?? '')));
  await page.locator('.map-drawing').focus();
  const landBefore = await page.locator('.map-land').getAttribute('transform');
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowRight');
  check('plus and arrow keys zoom and move the map', await page.locator('.map-land').getAttribute('transform') !== landBefore);
  const count = page.locator('.count-of-places').first();
  const placesBehindCount = Number((await count.innerText()).replace('+', ''));
  await count.click();
  check('a count on the price line opens the names and prices of its places', await page.locator('.menu-place').count() === placesBehindCount && placesBehindCount > 1 && /\$[\d,]+/.test(await page.locator('.menu-list').innerText()), await page.locator('.menu').innerText());
  await page.locator('.menu-place').first().click();
  check('a place in that list opens its pop-up', await page.locator('.pop-up').count() === 1);
  await page.keyboard.press('Escape');
  await page.locator('.hanging-flag').first().focus();
  check('a flag on the price line names itself for the keyboard', await page.locator('#tip').isVisible() && /\$/.test(await page.locator('#tip').innerText()));
  await page.keyboard.press('Enter');
  check('Enter on a flag opens its pop-up', await page.locator('.pop-up').count() === 1);
  await context.close();
}

async function journeysAboutPlace(): Promise<void> {
  const portlandOregon = { latitude: 45.52, longitude: -122.68 }, toronto = { latitude: 43.65, longitude: -79.38 };
  const withLocation = await browser.newContext({ viewport: laptop, reducedMotion: 'reduce', geolocation: portlandOregon, permissions: ['geolocation'] });
  let page = await openPage(withLocation, '/', 'US');
  check('a visitor in the United States sees the range of its states', (await answerText(page)).includes('$1,199 to $1,322') && (await answerText(page)).includes('population-weighted average'));
  const requestsBefore: string[] = [];
  page.on('request', request => requestsBefore.push(request.url()));
  await page.getByRole('button', { name: 'Use my location' }).click();
  await page.waitForURL(/me=US-OR/);
  check('Use my location finds the state', page.url().includes('me=US-OR') && (await answerText(page)).includes('No sales tax in Oregon'));
  check('the position is sent nowhere', !requestsBefore.some(address => address.includes('45.5') || address.includes('122.6')), requestsBefore.join(' '));
  await withLocation.close();
  const inToronto = await browser.newContext({ viewport: laptop, reducedMotion: 'reduce', geolocation: toronto, permissions: ['geolocation'] });
  page = await openPage(inToronto, '/?me=NL');
  await page.getByRole('button', { name: /You are in Netherlands/ }).click();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await page.waitForURL(/me=CA-ON/);
  check('Use my location finds a Canadian province from the place list', (await answerText(page)).includes('Ontario'));
  await inToronto.close();

  const withoutLocation = await browser.newContext({ viewport: laptop, reducedMotion: 'reduce', permissions: [] });
  page = await openPage(withoutLocation, '/', 'US');
  await page.getByRole('button', { name: 'Use my location' }).click();
  await page.waitForFunction(() => document.querySelector('#answer')!.textContent!.includes('did not share'));
  check('a refused location says so and offers the list', (await answerText(page)).includes('Your browser did not share your location. Choose your place from the list.'));
  await page.getByRole('button', { name: 'Choose your state' }).click();
  await page.getByRole('option', { name: /California, United States/ }).click();
  check('the state can be chosen from the list instead', page.url().includes('me=US-CA') && (await answerText(page)).includes('$1,322'));

  page = await openPage(withoutLocation, '/iphone-18-pro/6.3in-256gb?me=NL', 'DE');
  await settled(page);
  check('a shared link opened in another country shows what was shared', page.url().includes('me=NL') && !page.url().includes('DE') && (await answerText(page)).includes('costs in the Netherlands') && (await answerText(page)).includes('$1,633') && !(await answerText(page)).includes('you'), `${page.url()} ${await answerText(page)}`);
  await page.getByRole('button', { name: 'See the price in Germany' }).click();
  check('one action shows the opener’s own price beside the shared place', page.url().includes('me=DE') && page.url().includes('vs=NL') && (await answerText(page)).includes('costs you') && (await answerText(page)).includes('Compared with'), page.url());
  await page.goBack(); await settled(page);
  check('Back returns to the shared view', page.url().includes('me=NL') && !page.url().includes('vs='), page.url());
  page = await openPage(withoutLocation, '/', 'IL');
  check('Palestine: the page says prices were not found', (await answerText(page)).includes('We couldn’t find prices in occupied Palestine.') && (await answerText(page)).includes('Palestine'));
  page = await openPage(withoutLocation, '/?me=NL&panel=compared-place');
  await page.getByRole('searchbox').fill('pales');
  check('a place with no price is not offered as a comparison', await page.getByRole('option', { name: /Palestine/ }).count() === 0 && await page.locator('.menu-nothing-found').isVisible());
  page = await openPage(withoutLocation, '/?me=NL&panel=visitor-place');
  await page.getByRole('searchbox').fill('pales');
  await page.getByRole('option', { name: /Palestine/ }).click();
  check('a place with no price can still be where the visitor is', page.url().includes('me=PS'));
  await withoutLocation.close();
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
  await page.screenshot({ path: `${photographFolder}/laptop-44-prices-did-not-load.png` });
  await page.unroute('**/data/price-snapshot-*');
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.page === 'ready');
  check('Try again loads the prices', (await answerText(page)).includes('$1,633'));

  const withoutScript = await browser.newContext({ viewport: laptop, javaScriptEnabled: false });
  const plainPage = await withoutScript.newPage();
  await plainPage.goto(`${siteAddress}/?me=NL`);
  check('without JavaScript the answer is still on the page', (await plainPage.locator('#answer').innerText()).includes('costs $1,633 in the Netherlands'));
  await plainPage.screenshot({ path: `${photographFolder}/laptop-45-without-javascript.png` });

  const shortScreen = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const shortPage = await openPage(shortScreen, '/?me=US-CA&vs=CA-ON');
  await settled(shortPage);
  check('at 1280 by 720 every row of the answer shows without scrolling inside it', await answerShowsEverything(shortPage) && await priceLineFlagsAreApart(shortPage));
  await shortPage.screenshot({ path: `${photographFolder}/laptop-46-short-screen-1280-by-720.png` });
  const largeText = await phoneContext();
  const largeTextPage = await openPage(largeText, `${topMacBookPro}?me=VN&in=VND&vs=KR`);
  await largeTextPage.addStyleTag({ content: 'html { font-size: 130%; } body { zoom: 1.3; }' });
  await settled(largeTextPage);
  check('enlarged text on a phone scrolls down, never sideways', await largeTextPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check('enlarged text on a phone clips no control', await largeTextPage.evaluate(() => [...document.querySelectorAll('.bar button, .answer button, .map-areas button, .price-line-head button')]
    .every(control => { const box = control.getBoundingClientRect(); return box.width === 0 || (box.left >= -1 && box.right <= document.documentElement.clientWidth + 1); })));
  await largeTextPage.screenshot({ path: `${photographFolder}/phone-47-enlarged-text.png`, fullPage: true });
  await Promise.all([context.close(), withoutScript.close(), shortScreen.close(), largeText.close()]);
}

if (!onlyNamesContaining || onlyNamesContaining === 'journeys') {
  checkShareCardText();
  await journeyByMouse();
  await journeyByKeyboard();
  await journeysAboutPlace();
  await journeysWhenThingsFail();
}
await photographShareCards();
await photographEveryState();
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED:\n${failures.join('\n')}` : '\nEverything checked is working.');
process.exit(failures.length ? 1 : 0);
