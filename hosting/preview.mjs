// Runs the built Worker on this machine, in the same runtime Sites uses: node hosting/preview.mjs [port]
import { Miniflare } from 'miniflare';

const port = Number(process.argv[2] ?? 8787);
const worker = new Miniflare({
  host: '127.0.0.1',
  port,
  modulesRoot: 'dist/server',
  modules: [{ type: 'ESModule', path: 'dist/server/index.js' }, { type: 'CompiledWasm', path: 'dist/server/resvg.wasm' }],
  compatibilityDate: '2026-07-01',
  // No Cloudflare location here: /api/whereami answers with the CF-IPCountry header, which a test can set.
  cf: false,
});
await worker.ready;
console.log(`Apple Prices on http://127.0.0.1:${port}`);
