import { Resvg, initWasm } from '@resvg/resvg-wasm';
import resvgModule from './resvg.wasm';

// WEB_ASSETS (path -> { contentType, etag, gzippedBase64 }) and SHARE_CARD_FONT_BASE64 are filled in by hosting/build.mjs.
const webAssets = WEB_ASSETS;

const bytesFromBase64 = base64 => Uint8Array.from(atob(base64), character => character.charCodeAt(0));
const shareCardFont = bytesFromBase64(SHARE_CARD_FONT_BASE64);
let resvgReady;

async function renderPng(svg) {
  resvgReady ??= initWasm(resvgModule);
  await resvgReady;
  return new Resvg(svg, { font: { fontBuffers: [shareCardFont], defaultFontFamily: 'DejaVu Sans', loadSystemFonts: false } }).render().asPng();
}

async function applePhotoAsDataUrl(appleImageUrl) {
  const response = await fetch(`${appleImageUrl}?wid=700&hei=700&fmt=png-alpha`, { cf: { cacheTtl: 86400 } });
  if (!response.ok) throw new Error(`Apple image ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

const escapeXml = text => text.replace(/[<>&"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[character]);

async function shareTestSvg(url) {
  const photo = await applePhotoAsDataUrl('https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/iphone-17-finish-select-mistblue-202509');
  const line = (y, size, weight, text, fill = '#111') => `<text x="760" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(text)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#f5f5f7"/>
    <image href="${photo}" x="60" y="100" width="640" height="640"/>
    ${line(170, 64, 700, url.searchParams.get('text') || 'iPhone 17 · 256GB')}
    ${line(300, 44, 400, 'Cheapest: Oregon $929 (€841)', '#1a7f37')}
    ${line(380, 44, 400, 'You: Netherlands €969 ($1,071)')}
    ${line(460, 44, 400, 'Most expensive: Türkiye ₺76.999 ($1,912)', '#c0392b')}
    ${line(540, 36, 400, '₹ ₩ ¥ £ ₫ ₺ € $ — Prices in occupied Palestine not known')}
    ${line(820, 32, 400, 'appleprices.jjpcodes.com · slopped up by @jjpcodes', '#555')}
  </svg>`;
}

function serveWebAsset(request, asset) {
  const headers = { 'Content-Type': asset.contentType, 'Content-Encoding': 'gzip', ETag: asset.etag, 'Cache-Control': 'public, max-age=3600' };
  if (request.headers.get('If-None-Match') === asset.etag) return new Response(null, { status: 304, headers });
  return new Response(bytesFromBase64(asset.gzippedBase64), { headers, encodeBody: 'manual' });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/whereami') {
      return Response.json({ country: request.cf?.country ?? request.headers.get('CF-IPCountry') ?? null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/share-test.png') {
      const started = Date.now();
      const png = await renderPng(await shareTestSvg(url));
      return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Server-Timing': `render;dur=${Date.now() - started}` } });
    }
    const asset = webAssets[url.pathname];
    if (asset) return serveWebAsset(request, asset);
    if (url.pathname === '/') return new Response('Apple Prices: coming soon.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    return new Response('Not found', { status: 404 });
  },
};
