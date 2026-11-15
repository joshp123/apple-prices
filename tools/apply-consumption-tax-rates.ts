// Writes the consumption tax rates in tools/consumption-tax-rates.ts into the existing snapshot, without asking Apple for prices again.
// node tools/apply-consumption-tax-rates.ts
import { fromBinary, toBinary } from '@bufbuild/protobuf';
import { readFile, writeFile } from 'node:fs/promises';
import { PriceSnapshotSchema } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { consumptionTaxOf } from './consumption-tax-rates.ts';

const snapshotFile = new URL('../data/price-snapshot.binpb', import.meta.url);
const snapshot = fromBinary(PriceSnapshotSchema, await readFile(snapshotFile));
for (const store of snapshot.appleStores) store.consumptionTax = consumptionTaxOf(store.countryCode, store.shelfPriceIncludesSalesTax);
await writeFile(snapshotFile, toBinary(PriceSnapshotSchema, snapshot));
for (const store of snapshot.appleStores) console.log(store.countryCode, store.consumptionTax ? (store.consumptionTax.percent ?? `none: ${store.consumptionTax.whyNoSingleRate}`) : 'adds tax at checkout');
