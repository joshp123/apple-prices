import { fromBinary } from '@bufbuild/protobuf';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
// @ts-expect-error The WebAssembly module is uploaded beside the Worker by hosting/build.mjs.
import resvgModule from './resvg.wasm';
import { PriceSnapshotSchema, type PriceSnapshot } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { priceComparison, shareSentence, type Selection } from '../src/price-comparison.ts';
import { productPhotoFor } from '../src/product-photos.ts';
import { flagCodesOnShareCard, postPictureSvg, shareCardHeight, shareCardSvg, shareCardWidth } from '../src/share-card-svg.ts';
import { isShareLinkPath, selectionFromShareLink, shareCardPath, shareLinkPath } from '../src/share-link.ts';
import { productNameWithStorage, specLine } from '../src/spec-words.ts';

type WebAsset = { contentType: string; base64: string; isGzipped: boolean; cacheControl: string };
// Filled in by hosting/build.mjs: every file the page loads by its address, the page itself with gaps for what differs by link,
// and the share card's fonts and product photos.
declare const WEB_ASSETS: Record<string, WebAsset>;
declare const PAGE_HTML: string;
declare const PRICE_SNAPSHOT_PATH: string;
declare const FLAG_PATHS: Record<string, string>;
declare const SHARE_CARD_FONTS_BASE64: string[];
declare const SHARE_CARD_PRODUCT_PHOTOS_BASE64: Record<string, string>;
const webAssets = WEB_ASSETS, flagPaths = FLAG_PATHS;
const titleAndSharePreviewTagsGap = '<!-- title and share preview tags -->', answerFromServerGap = '<!-- answer from server -->';

const bytesFromBase64 = (base64: string) => Uint8Array.from(atob(base64), character => character.charCodeAt(0));

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function webAssetBytes(path: string): Promise<Uint8Array> {
  const asset = webAssets[path], stored = bytesFromBase64(asset.base64);
  if (!asset.isGzipped) return stored;
  return new Uint8Array(await new Response(new Blob([stored]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}

let priceSnapshotOnceRead: Promise<PriceSnapshot>;
function priceSnapshot(): Promise<PriceSnapshot> {
  return priceSnapshotOnceRead ??= webAssetBytes(PRICE_SNAPSHOT_PATH).then(bytes => fromBinary(PriceSnapshotSchema, bytes));
}

const shareCardFonts = SHARE_CARD_FONTS_BASE64.map(bytesFromBase64);
let resvgOnceReady: Promise<void>;
async function renderPng(svg: string): Promise<Uint8Array> {
  await (resvgOnceReady ??= initWasm(resvgModule));
  // Both objects hold WebAssembly memory that only free() gives back.
  const drawing = new Resvg(svg, { font: { fontBuffers: shareCardFonts, defaultFontFamily: 'Inter', loadSystemFonts: false } });
  try {
    const picture = drawing.render();
    try {
      return picture.asPng().slice();
    } finally {
      picture.free();
    }
  } finally {
    drawing.free();
  }
}

async function flagAsDataUrl(flagCode: string): Promise<string> {
  const path = flagPaths[flagCode];
  return `data:${webAssets[path].contentType};base64,${base64FromBytes(await webAssetBytes(path))}`;
}

type CardDrawing = typeof shareCardSvg;
async function cardPng(snapshot: PriceSnapshot, selection: Selection, drawCard: CardDrawing): Promise<Uint8Array> {
  const comparison = priceComparison(snapshot, selection);
  const productPhoto = productPhotoFor(selection.productId, selection.configurationId);
  const flagCodes = flagCodesOnShareCard(comparison).filter(flagCode => flagPaths[flagCode]);
  const flagDataUrls = await Promise.all(flagCodes.map(flagAsDataUrl));
  const productPhotoDataUrl = `data:image/jpeg;base64,${SHARE_CARD_PRODUCT_PHOTOS_BASE64[productPhoto.imageName]}`;
  return renderPng(drawCard(comparison, { productPhoto, productPhotoDataUrl, flagDataUrls: Object.fromEntries(flagCodes.map((flagCode, index) => [flagCode, flagDataUrls[index]])) }));
}

const escapeHtml = (text: string) => text.replace(/[<>&"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[character]!);

const htmlResponse = (html: string, status = 200) => new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });

// The page for one link: its own title, the tags that make X and other apps show this link's share card, and the answer in words,
// which is what a visitor reads until the prices load, and all a browser without JavaScript shows.
function pageForShareLink(snapshot: PriceSnapshot, selection: Selection, origin: string): Response {
  const comparison = priceComparison(snapshot, selection);
  const title = `${productNameWithStorage(comparison.product, comparison.configuration)}: what it costs in each country`, sentence = shareSentence(comparison);
  const tags = Object.entries({
    'og:type': 'website', 'og:site_name': 'Apple Prices', 'og:title': title, 'og:description': sentence, 'og:url': origin + shareLinkPath(selection),
    'og:image': origin + shareCardPath(selection), 'og:image:width': String(shareCardWidth), 'og:image:height': String(shareCardHeight),
    // Twitter lays its title over the bottom left corner of the picture, so it is short: it must not reach the rows.
    'twitter:card': 'summary_large_image', 'twitter:creator': '@jjpcodes', 'twitter:title': 'Apple Prices', 'twitter:description': sentence, 'twitter:image': origin + shareCardPath(selection),
  }).map(([name, content]) => `<meta ${name.startsWith('og:') ? 'property' : 'name'}="${name}" content="${escapeHtml(content)}">`);
  const head = [`<title>${escapeHtml(title)}</title>`, `<meta name="description" content="${escapeHtml(sentence)}">`, ...tags].join('\n');
  const answer = `<div class="answer-from-server"><h1>${escapeHtml(comparison.product.productName)}</h1><p>${escapeHtml(specLine(comparison.product, comparison.configuration))}</p><p>${escapeHtml(sentence)}</p>`
    + '<p>Prices are Apple’s own and include tax. The map and every other price need JavaScript.</p></div>';
  return htmlResponse(PAGE_HTML.replace(titleAndSharePreviewTagsGap, head).replace(answerFromServerGap, answer));
}

const pageNotFound = () => htmlResponse('<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found</title>'
  + '<body style="font: 17px/1.4 system-ui, sans-serif; margin: 15vh auto; max-width: 30em; padding: 0 1.5em"><h1>There is no page at this address.</h1><p><a href="/">See what Apple’s products cost in each country</a></p>', 404);

function serveWebAsset(asset: WebAsset): Response {
  const headers: Record<string, string> = { 'Content-Type': asset.contentType, 'Cache-Control': asset.cacheControl };
  if (asset.isGzipped) headers['Content-Encoding'] = 'gzip';
  return new Response(bytesFromBase64(asset.base64), { headers, encodeBody: 'manual' } as ResponseInit);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/whereami') {
      const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? request.headers.get('CF-IPCountry') ?? null;
      return Response.json({ country }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/data/price-snapshot.binpb') {
      return serveWebAsset({ ...webAssets[PRICE_SNAPSHOT_PATH], cacheControl: 'public, max-age=300' });
    }
    const asset = webAssets[url.pathname];
    if (asset) return serveWebAsset(asset);

    const snapshot = await priceSnapshot();
    const drawCard = ({ 'share-card': shareCardSvg, 'post-picture': postPictureSvg } as Record<string, CardDrawing>)[url.pathname.split('/')[1]];
    if (drawCard && url.pathname.endsWith('.png') && isShareLinkPath(snapshot, url.pathname.slice(url.pathname.indexOf('/', 1), -'.png'.length))) {
      const started = Date.now();
      const png = await cardPng(snapshot, selectionFromShareLink(snapshot, url), drawCard);
      return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'Server-Timing': `render;dur=${Date.now() - started}` } });
    }
    if (url.pathname === '/' || isShareLinkPath(snapshot, url.pathname)) return pageForShareLink(snapshot, selectionFromShareLink(snapshot, url), url.origin);
    return pageNotFound();
  },
};
