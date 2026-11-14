import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const webAssetFiles = { '/data/price-snapshot.binpb': ['data/price-snapshot.binpb', 'application/x-protobuf'] };

const webAssets = {};
for (const [path, [file, contentType]] of Object.entries(webAssetFiles)) {
  const bytes = await readFile(file);
  webAssets[path] = { contentType, etag: `"${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}"`, gzippedBase64: gzipSync(bytes, { level: 9 }).toString('base64') };
}

await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
const define = {
  WEB_ASSETS: JSON.stringify(webAssets),
  SHARE_CARD_FONT_BASE64: JSON.stringify((await readFile('hosting/DejaVuSans.ttf')).toString('base64')),
};
const bundled = await build({ entryPoints: ['hosting/worker.mjs'], bundle: true, format: 'esm', platform: 'browser', external: ['./resvg.wasm'], define, write: false });
const worker = bundled.outputFiles[0].text;
await writeFile('dist/server/index.js', worker);
await copyFile('node_modules/@resvg/resvg-wasm/index_bg.wasm', 'dist/server/resvg.wasm');
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log(`Worker ${(Buffer.byteLength(worker) / 1048576).toFixed(2)} MiB (${(gzipSync(worker).length / 1048576).toFixed(2)} MiB gzipped) plus resvg.wasm`);
