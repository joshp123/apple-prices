import opentype from 'opentype.js';
import { zlibSync } from 'fflate';

const font = opentype.parse(Uint8Array.from(atob(FONT_DATA), c => c.charCodeAt(0)).buffer);
const snapshot = Uint8Array.from(atob(SNAPSHOT_DATA), c => c.charCodeAt(0));
const width = 1600, height = 900;
const encoder = new TextEncoder();
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = encoder.encode(type), result = new Uint8Array(data.length + 12), view = new DataView(result.buffer);
  view.setUint32(0, data.length); result.set(name, 4); result.set(data, 8); view.setUint32(data.length + 8, crc32(result.subarray(4, data.length + 8))); return result;
}
function render(text) {
  const pixels = new Uint8Array((width * 3 + 1) * height).fill(255);
  for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
  const edges = []; let x = 0, y = 0, startX = 0, startY = 0;
  function line(nx, ny) { if (y !== ny) edges.push([x, y, nx, ny]); x = nx; y = ny; }
  for (const c of font.getPath(text.slice(0, 80), 80, 475, 72).commands) {
    if (c.type === 'M') { x = startX = c.x; y = startY = c.y; }
    else if (c.type === 'L') line(c.x, c.y);
    else if (c.type === 'Q') { const ox = x, oy = y; for (let i = 1; i <= 12; i++) { const t = i / 12, s = 1 - t; line(s*s*ox + 2*s*t*c.x1 + t*t*c.x, s*s*oy + 2*s*t*c.y1 + t*t*c.y); } }
    else if (c.type === 'C') { const ox = x, oy = y; for (let i = 1; i <= 12; i++) { const t = i / 12, s = 1 - t; line(s*s*s*ox + 3*s*s*t*c.x1 + 3*s*t*t*c.x2 + t*t*t*c.x, s*s*s*oy + 3*s*s*t*c.y1 + 3*s*t*t*c.y2 + t*t*t*c.y); } }
    else if (c.type === 'Z') line(startX, startY);
  }
  for (let row = 0; row < height; row++) {
    const crossings = [];
    for (const [x1, y1, x2, y2] of edges) if ((y1 <= row + .5 && y2 > row + .5) || (y2 <= row + .5 && y1 > row + .5)) crossings.push(x1 + (row + .5 - y1) * (x2 - x1) / (y2 - y1));
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) for (let col = Math.max(0, Math.ceil(crossings[i])); col < Math.min(width, crossings[i + 1]); col++) { const offset = row * (width * 3 + 1) + 1 + col * 3; pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 20; }
  }
  const header = new Uint8Array(13), headerView = new DataView(header.buffer); headerView.setUint32(0, width); headerView.setUint32(4, height); header[8] = 8; header[9] = 2;
  const parts = [new Uint8Array([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlibSync(pixels)), chunk('IEND', new Uint8Array())];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { png.set(part, offset); offset += part.length; } return png;
}
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/whereami') return Response.json({country: request.cf?.country ?? request.headers.get('CF-IPCountry') ?? null, region: request.cf?.region ?? null, regionCode: request.cf?.regionCode ?? null}, {headers: {'Cache-Control': 'no-store'}});
  if (url.pathname === '/api/share-test.png') { const png = render(url.searchParams.get('text') || 'Apple Prices'); return new Response(png, {headers: {'Content-Type': 'image/png', 'Cache-Control': 'no-store'}}); }
  if (url.pathname === '/data/test.binpb') return new Response(snapshot, {headers: {'Content-Type': 'application/protobuf', 'Cache-Control': 'public, max-age=3600'}});
  if (url.pathname === '/') return new Response('Apple Prices — coming soon.', {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  return new Response('Not found', {status: 404});
} };
