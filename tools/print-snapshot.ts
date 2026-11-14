import { fromBinary } from '@bufbuild/protobuf';
import { readFile } from 'node:fs/promises';
import { PriceSnapshotSchema } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';

const snapshot = fromBinary(PriceSnapshotSchema, await readFile(new URL('../data/price-snapshot.binpb', import.meta.url)));
const productIdToShow = process.argv[2];

if (!productIdToShow) {
  for (const product of snapshot.products) {
    const notSold = snapshot.appleStores.filter(store => store.productIdsNotSold.includes(product.productId)).map(store => store.appleStoreId);
    const noPrice = snapshot.appleStores.filter(store => !store.productIdsNotSold.includes(product.productId) && !store.shelfPrices.some(price => price.productId === product.productId)).map(store => store.appleStoreId);
    console.log(`${product.productId}: ${product.configurations.length} configurations; not sold in ${notSold.join(' ') || 'none'}; no price from ${noPrice.join(' ') || 'none'}`);
  }
} else {
  const product = snapshot.products.find(product => product.productId === productIdToShow)!;
  for (const configuration of product.configurations) {
    const prices = snapshot.appleStores.map(store => {
      const price = store.shelfPrices.find(price => price.productId === product.productId && price.configurationId === configuration.configurationId);
      return price ? `${store.appleStoreId}=${Number(price.priceInHundredths) / 100}` : '';
    }).filter(Boolean);
    console.log(`${configuration.configurationId} (${prices.length} stores): ${prices.join(' ')}`);
  }
}
