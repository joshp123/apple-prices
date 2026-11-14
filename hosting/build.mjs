import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
const font = await readFile('hosting/DejaVuSans.ttf');
const snapshot = await readFile('data/price-snapshot.binpb');
await mkdir('dist/server', {recursive: true});
await mkdir('dist/.openai', {recursive: true});
await build({entryPoints: ['hosting/worker.mjs'], outfile: 'dist/server/index.js', bundle: true, format: 'esm', platform: 'browser', define: {FONT_DATA: JSON.stringify(font.toString('base64')), SNAPSHOT_DATA: JSON.stringify(snapshot.toString('base64'))}});
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
