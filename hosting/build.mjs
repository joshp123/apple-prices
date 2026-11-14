import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const contentHash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const neverChangesAtThisAddress = 'public, max-age=31536000, immutable';

// Every file the page loads is served from an address that holds its content's hash, so browsers keep it for good.
const webAssets = {};
function addWebAsset(name, extension, bytes, contentType) {
  const path = `/${name}-${contentHash(bytes)}.${extension}`, isGzipped = extension !== 'png';
  webAssets[path] = { contentType, base64: (isGzipped ? gzipSync(bytes, { level: 9 }) : bytes).toString('base64'), isGzipped, cacheControl: neverChangesAtThisAddress };
  return path;
}

const priceSnapshotPath = addWebAsset('data/price-snapshot', 'binpb', await readFile('data/price-snapshot.binpb'), 'application/x-protobuf');
const mapPlacesPath = addWebAsset('map/places', 'json', await readFile('assets/map/places.topojson'), 'application/json');
const flagPaths = {};
for (const flagFile of (await readdir('assets/flags')).filter(file => /\.(svg|png)$/.test(file))) {
  const [placeCode, extension] = flagFile.split('.');
  flagPaths[placeCode] = addWebAsset(`flags/${placeCode}`, extension, await readFile(`assets/flags/${flagFile}`), extension === 'svg' ? 'image/svg+xml' : 'image/png');
}
const shareCardFontsBase64 = await Promise.all(['Inter-Regular.ttf', 'Inter-SemiBold.ttf', 'Inter-Bold.ttf'].map(async fontFile => (await readFile(`assets/fonts/${fontFile}`)).toString('base64')));

const shareCardProductPhotosBase64 = {};
for (const photoFile of await readdir('assets/product-photos')) shareCardProductPhotosBase64[photoFile.replace('.jpg', '')] = (await readFile(`assets/product-photos/${photoFile}`)).toString('base64');

const addressesOfFiles = { PRICE_SNAPSHOT_PATH: JSON.stringify(priceSnapshotPath), MAP_PLACES_PATH: JSON.stringify(mapPlacesPath), FLAG_PATHS: JSON.stringify(flagPaths) };
const page = await build({ entryPoints: ['web/page.ts'], bundle: true, format: 'esm', target: 'es2022', minify: true, define: addressesOfFiles, write: false, legalComments: 'none' });
const pageScript = Buffer.from(page.outputFiles[0].contents);
const pageStyles = Buffer.from((await build({ entryPoints: ['web/style.css'], bundle: true, minify: true, write: false, legalComments: 'none' })).outputFiles[0].contents);
const pageHtml = (await readFile('web/index.html', 'utf8'))
  .replace('/page.js', addWebAsset('page', 'js', pageScript, 'text/javascript; charset=utf-8'))
  .replace('/page.css', addWebAsset('page', 'css', pageStyles, 'text/css; charset=utf-8'));

await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
const define = { ...addressesOfFiles, WEB_ASSETS: JSON.stringify(webAssets), PAGE_HTML: JSON.stringify(pageHtml), SHARE_CARD_FONTS_BASE64: JSON.stringify(shareCardFontsBase64), SHARE_CARD_PRODUCT_PHOTOS_BASE64: JSON.stringify(shareCardProductPhotosBase64) };
const bundled = await build({ entryPoints: ['hosting/worker.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', external: ['./resvg.wasm'], define, write: false });
const worker = bundled.outputFiles[0].text;
const resvg = await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm');
await writeFile('dist/server/index.js', worker);
await writeFile('dist/server/resvg.wasm', resvg);
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');

const mebibytes = bytes => `${(bytes / 1048576).toFixed(2)} MiB`;
const workerGzipped = gzipSync(worker).length, resvgGzipped = gzipSync(resvg).length;
console.log(`Page script ${mebibytes(pageScript.length)} (${mebibytes(gzipSync(pageScript).length)} gzipped), styles ${mebibytes(gzipSync(pageStyles).length)} gzipped`);
console.log(`Worker ${mebibytes(Buffer.byteLength(worker))} (${mebibytes(workerGzipped)} gzipped) plus resvg.wasm ${mebibytes(resvg.length)} (${mebibytes(resvgGzipped)} gzipped): ${mebibytes(workerGzipped + resvgGzipped)} gzipped in all`);
