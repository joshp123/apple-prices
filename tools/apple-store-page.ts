import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const browserUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15';
const cacheDirectory = new URL('../cache/', import.meta.url);
const cacheLifetimeMilliseconds = 12 * 60 * 60 * 1000;

export type FetchedApplePage = { requestedUrl: string; finalUrl: string; httpStatus: number; html: string };

// Apple answers 404 for a page it doesn't have. It answers bursts of requests with 541, 403 or 503, which pass if you wait.
const notFoundHttpStatus = 404;
const maximumAttempts = 8;

export async function fetchApplePage(url: string): Promise<FetchedApplePage> {
  for (let attempt = 1; ; attempt++) {
    let failure: string;
    try {
      const response = await fetch(url, { headers: { 'user-agent': browserUserAgent, 'accept-language': 'en' }, redirect: 'follow' });
      const page = { requestedUrl: url, finalUrl: response.url, httpStatus: response.status, html: await response.text() };
      if (response.status === 200 || response.status === notFoundHttpStatus) return page;
      failure = `HTTP ${response.status}`;
    } catch (error) {
      failure = String(error);
    }
    if (attempt === maximumAttempts) throw new Error(`Apple did not serve ${url}: ${failure}`);
    await new Promise(resolve => setTimeout(resolve, 5000 * 2 ** (attempt - 1)));
  }
}

export function isProductPageServed(page: FetchedApplePage, shopPath: string): boolean {
  return page.httpStatus === 200 && decodeURI(new URL(page.finalUrl).pathname).includes(decodeURI(shopPath));
}

const pauseBeforeConfirmingAbsenceMilliseconds = 20_000;

// Apple sometimes answers a burst of requests by redirecting to the store's home page, which looks like "not sold here".
export async function fetchApplePageConfirmingAbsence(url: string, shopPath: string): Promise<FetchedApplePage> {
  const page = await fetchApplePage(url);
  if (isProductPageServed(page, shopPath)) return page;
  await new Promise(resolve => setTimeout(resolve, pauseBeforeConfirmingAbsenceMilliseconds));
  return fetchApplePage(url);
}

// Keeps what was read from each page, not the page, so reruns during development are fast. Absences are never cached.
export async function readApplePageCached<Result>(url: string, readPage: (page: FetchedApplePage) => Result, fetchPage: () => Promise<FetchedApplePage> = () => fetchApplePage(url)): Promise<Result> {
  const cacheFile = new URL(createHash('sha256').update(url).digest('hex').slice(0, 32) + '.json', cacheDirectory);
  try {
    const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
    if (Date.now() - cached.savedAtMilliseconds < cacheLifetimeMilliseconds) return cached.result;
  } catch {}
  const result = readPage(await fetchPage());
  if (Array.isArray(result) && !result.length) return result;
  await mkdir(cacheDirectory, { recursive: true });
  await writeFile(cacheFile, JSON.stringify({ url, savedAtMilliseconds: Date.now(), result }));
  return result;
}

export async function forEachWithConcurrency<Item>(items: Item[], concurrency: number, visit: (item: Item) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) await visit(items[nextIndex++]);
  });
  await Promise.all(workers);
}

export function withPlainSpaces(text: string): string {
  return text.replace(/[\s   ]+/g, ' ').replace(/[‐‑]/g, '-').trim();
}

function readJsonObjectStartingAt(text: string, openingBraceIndex: number): unknown {
  let depth = 0, insideString = false, escaped = false;
  for (let index = openingBraceIndex; index < text.length; index++) {
    const character = text[index];
    if (insideString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') insideString = false;
    } else if (character === '"') insideString = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return JSON.parse(text.slice(openingBraceIndex, index + 1));
  }
  throw new Error('Unterminated JSON object');
}

// The parts of Apple's product selection data this scraper reads. Part-number pages key prices by fullPrice or
// price; watch pages key them by priceKey and put dimensions in a nested object.
type AppleSelectableProduct = {
  partNumber?: string;
  part?: string;
  fullPrice?: string;
  price?: string;
  priceKey?: string;
  carrierModel?: string;
  imageKey?: string;
  dimensions?: Record<string, string>;
  [dimensionKey: string]: unknown;
};
type AppleDisplayPrice = { currentPrice?: { raw_amount?: string }; amount?: number };
export type AppleProductSelectionData = { products?: AppleSelectableProduct[]; displayValues?: { prices?: Record<string, AppleDisplayPrice> } };

export function readProductSelectionData(html: string): AppleProductSelectionData | null {
  const match = /window\.PRODUCT_SELECTION_BOOTSTRAP\s*=\s*\{\s*productSelectionData\s*:\s*/.exec(html);
  return match ? readJsonObjectStartingAt(html, match.index + match[0].length) as AppleProductSelectionData : null;
}

export type ApplePriceRecord = { name: string; price: number; currencyCode: string; partNumber: string; imageUrl: string };

export function readApplePriceRecords(html: string): ApplePriceRecord[] {
  const records: ApplePriceRecord[] = [];
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data: any;
    try { data = JSON.parse(json); } catch { continue; }
    if (data?.['@type'] !== 'Product') continue;
    for (const offer of [data.offers].flat()) {
      if (offer?.price != null) records.push({ name: withPlainSpaces(data.name ?? ''), price: Number(offer.price), currencyCode: offer.priceCurrency ?? '', partNumber: offer.sku ?? '', imageUrl: [data.image].flat()[0] ?? '' });
    }
  }
  if (records.length) return records;
  // China and sometimes the Philippines omit the product record; Apple's page analytics carry the same part and price.
  for (const [, partNumber, price] of html.matchAll(/"partNumber":"([^"]+)","price":\{"fullPrice":([0-9.]+)\}/g)) {
    records.push({ name: '', price: Number(price), currencyCode: '', partNumber, imageUrl: '' });
  }
  return records;
}

export type PricedVariant = { partNumber: string; dimensions: Record<string, string>; carrier: string; price: number; imageKey: string };

const dimensionKeyPattern = /(?:^|-)dimension([A-Za-z]+)$/;

export function readPricedVariants(data: AppleProductSelectionData): PricedVariant[] {
  const prices = data.displayValues?.prices ?? {};
  const variants: PricedVariant[] = [];
  for (const product of data.products ?? []) {
    const priceEntry = [product.fullPrice, product.price, product.priceKey].map(key => key && prices[key]).find(Boolean) || undefined;
    const price = Number(priceEntry?.currentPrice?.raw_amount ?? priceEntry?.amount);
    if (!price) continue;
    const dimensions: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...product, ...product.dimensions })) {
      const match = dimensionKeyPattern.exec(key);
      if (match && match[1] !== 'Steporder' && typeof value === 'string') dimensions[match[1]] = value;
    }
    variants.push({ partNumber: product.partNumber ?? product.part ?? '', dimensions, carrier: product.carrierModel ?? '', price, imageKey: product.imageKey ?? '' });
  }
  return variants;
}

export function readLinkedPaths(html: string, pathPrefix: string): string[] {
  const escapedPrefix = pathPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...new Set([...html.matchAll(new RegExp(`${escapedPrefix}[^"'\\s<>\\\\]+`, 'g'))].map(match => match[0]))];
}

export function readableText(html: string): string {
  return withPlainSpaces(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;/g, '$'));
}
