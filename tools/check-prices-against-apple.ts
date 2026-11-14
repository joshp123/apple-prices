import { fromBinary } from '@bufbuild/protobuf';
import { readFile } from 'node:fs/promises';
import { PriceSnapshotSchema, PriceSourceKind } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { fetchApplePage, forEachWithConcurrency, readApplePriceRecords } from './apple-store-page.ts';

// Checks a random sample of the snapshot against a different Apple page from the one it was scraped from:
// the store's own page for that part number. The part number, currency and price must all match, and the storage too
// where Apple's product name states it.
const pricesToCheckPerStore = Number(process.argv[2] ?? 3);
const snapshot = fromBinary(PriceSnapshotSchema, await readFile(new URL('../data/price-snapshot.binpb', import.meta.url)));
const specsByConfiguration = new Map(snapshot.products.flatMap(product => product.configurations.map(configuration => [`${product.productId} ${configuration.configurationId}`, configuration.specs])));

const samples = snapshot.appleStores.filter(store => store.priceSourceKind === PriceSourceKind.APPLE_ONLINE_STORE).flatMap(store =>
  [...store.shelfPrices].sort(() => Math.random() - 0.5).slice(0, pricesToCheckPerStore).map(price => ({ store, price })));

const storageAsApplePrintsIt = (gigabytes: number) => gigabytes >= 1000 ? `${gigabytes / 1000}TB` : `${gigabytes}GB`;

type CheckResult = 'matches' | 'differs' | 'unverifiable';
const results: { result: CheckResult; line: string }[] = [];

await forEachWithConcurrency(samples, 2, async ({ store, price }) => {
  const url = `${store.storeUrl}/shop/product/${price.applePartNumber}`;
  const ourPrice = Number(price.priceInHundredths) / 100;
  const page = await fetchApplePage(url);
  const record = page.httpStatus === 200 ? readApplePriceRecords(page.html).find(record => record.partNumber.toUpperCase() === price.applePartNumber.toUpperCase()) : undefined;
  const storage = specsByConfiguration.get(`${price.productId} ${price.configurationId}`)?.storageGigabytes;
  const nameStatesStorage = record && /\d\s?(GB|TB)/i.test(record.name);
  const storageMatches = !storage || !nameStatesStorage || record!.name.replace(/\s/g, '').includes(storageAsApplePrintsIt(storage));
  const currencyMatches = !record?.currencyCode || record.currencyCode === store.currencyCode;
  const result: CheckResult = !record ? 'unverifiable' : record.price === ourPrice && currencyMatches && storageMatches ? 'matches' : 'differs';
  results.push({ result, line: `${result.padEnd(12)} ${store.appleStoreId} ${price.productId} ${price.configurationId}: ours ${ourPrice} ${store.currencyCode}, Apple's ${record ? `${record.price} ${record.currencyCode} "${record.name}"` : '?'} (${url})` });
});

for (const { line } of results.sort((a, b) => a.result.localeCompare(b.result))) console.log(line);
const count = (result: CheckResult) => results.filter(entry => entry.result === result).length;
console.log(`\n${count('matches')} match, ${count('differs')} differ, ${count('unverifiable')} could not be checked, of ${results.length}`);
if (count('differs') || count('matches') < results.length / 2) process.exit(1);
