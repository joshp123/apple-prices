import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  AppleStoreSchema, CurrencyRateSchema, ExchangeRatesSchema, PriceSnapshotSchema, PriceSourceKind, ProductConfigurationSchema,
  ProductSchema, RecyclingFeeAmountSchema, RecyclingFeeSchema, SalesTaxRegionSchema, ShelfPriceSchema, type PriceSnapshot, type ProductSpecs,
} from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { catalogueProducts, type CatalogueProduct } from './apple-product-catalogue.ts';
import {
  fetchApplePage, fetchApplePageConfirmingAbsence, forEachWithConcurrency, isProductPageServed, readApplePageCached, readApplePriceRecords,
  readLinkedPaths, readPricedVariants, readProductSelectionData, readableText,
} from './apple-store-page.ts';
import { appleOnlineStores, appleStoresAddingSalesTaxAtCheckout, type AppleOnlineStore } from './apple-stores.ts';
import { configurationIdFromSpecs, specsFromLocalisedMacProductName, specsFromMacProductName, specsFromVariantDimensions } from './product-specs.ts';
import { canadaCombinedSalesTaxPercent, canadaSalesTaxSource, unitedStatesCombinedSalesTaxPercent, unitedStatesSalesTaxSource, type SalesTaxSource } from './sales-tax-rates.ts';

const snapshotFile = new URL('../data/price-snapshot.binpb', import.meta.url);

type ScrapedShelfPrice = { productId: string; configurationId: string; specs: ProductSpecs; price: number; sourcePageUrl: string; applePartNumber: string };
// notSold means Apple's store answered that it has no such product; an empty price list alone proves nothing.
type ScrapedProduct = { prices: ScrapedShelfPrice[]; notSold: boolean };

const warnings: string[] = [];
const notSold: ScrapedProduct = { prices: [], notSold: true };

function lowestPricePerConfiguration(prices: ScrapedShelfPrice[], where: string): ScrapedShelfPrice[] {
  const byConfiguration = new Map<string, ScrapedShelfPrice>();
  for (const price of prices) {
    const existing = byConfiguration.get(price.configurationId);
    if (existing && existing.price !== price.price) warnings.push(`${where} ${price.configurationId}: colours priced differently (${existing.price} and ${price.price}); keeping the lower`);
    if (!existing || price.price < existing.price) byConfiguration.set(price.configurationId, price);
  }
  return [...byConfiguration.values()];
}

async function scrapeVariantTable(store: AppleOnlineStore, product: CatalogueProduct): Promise<ScrapedProduct> {
  const url = `${store.storeUrl}/shop/${product.shopPath}`;
  const variants = await readApplePageCached(url, page => {
    if (!isProductPageServed(page, product.shopPath)) return [];
    const data = readProductSelectionData(page.html);
    const variants = data ? readPricedVariants(data) : [];
    if (!variants.length) throw new Error(`${url} is served but no prices could be read from it`);
    return variants;
  }, () => fetchApplePageConfirmingAbsence(url, product.shopPath));
  if (!variants.length) return notSold;
  const filter = product.onlyVariantsWithDimension;
  const prices = variants
    .filter(variant => !variant.carrier || /UNLOCKED/i.test(variant.carrier))
    .filter(variant => !filter || variant.dimensions[filter.dimension] === filter.value)
    .map(variant => {
      const specs = specsFromVariantDimensions(variant.dimensions, product.fixedSpecs);
      return { productId: product.productId, configurationId: configurationIdFromSpecs(specs), specs, price: variant.price, sourcePageUrl: url, applePartNumber: variant.partNumber };
    });
  return { prices: lowestPricePerConfiguration(prices, `${store.appleStoreId} ${product.productId}`), notSold: false };
}

// The first five characters of an Apple part number name the same model, in the same colour, in every country.
const appleModelPartNumberPrefix = (partNumber: string) => partNumber.slice(0, 5).toUpperCase();
const macSpecsByAppleModelPartNumberPrefix = new Map<string, ProductSpecs>();

const nanoTextureWords = /nano|ナノ|奈米|纳米|นาโน|나노/i;
const standardGlassWords = /standard|標準|标准|표준|tiêu chuẩn|มาตรฐาน|estándar|padrão|standaard|norma/i;

// For a model sold only outside the US, or a page without Apple's product record, read the spec from Apple's
// localised name (or the page's address) and accept it only if exactly one US standard configuration matches.
function usMacConfigurationMatchingLocalisedName(product: CatalogueProduct, nameOrAddress: string): ProductSpecs | undefined {
  const parsed = specsFromLocalisedMacProductName(nameOrAddress, product.fixedSpecs);
  if (!parsed) return undefined;
  const withoutGlass = (specs: ProductSpecs) => configurationIdFromSpecs({ ...specs, displayGlass: '' });
  let candidates = [...new Map([...macSpecsByAppleModelPartNumberPrefix.values()].map(specs => [configurationIdFromSpecs(specs), specs])).values()]
    .filter(specs => withoutGlass(specs) === withoutGlass(parsed));
  if (candidates.length > 1) {
    const glass = nanoTextureWords.test(nameOrAddress) ? 'Nano-texture glass' : standardGlassWords.test(nameOrAddress) ? 'Standard glass' : '';
    candidates = candidates.filter(specs => specs.displayGlass === glass);
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

async function scrapeMacStandardConfigurations(store: AppleOnlineStore, product: CatalogueProduct): Promise<ScrapedProduct> {
  const familyUrl = `${store.storeUrl}/shop/${product.shopPath}`;
  const configurationPaths = await readApplePageCached(familyUrl, page => {
    if (!isProductPageServed(page, product.shopPath)) return [];
    const paths = readLinkedPaths(page.html, `shop/${product.shopPath}/`);
    if (!paths.length) throw new Error(`${familyUrl} is served but links to no standard configurations`);
    return paths;
  }, () => fetchApplePageConfirmingAbsence(familyUrl, product.shopPath));
  if (!configurationPaths.length) return notSold;
  const prices: ScrapedShelfPrice[] = [];
  await forEachWithConcurrency(configurationPaths, 2, async path => {
    const url = `${store.storeUrl}/${path}`;
    const records = await readApplePageCached(url, page => {
      if (page.httpStatus !== 200) return [];
      const records = readApplePriceRecords(page.html);
      if (!records.length) throw new Error(`${url} has no price record`);
      return records;
    });
    if (!records.length) warnings.push(`${store.appleStoreId} ${product.productId}: Apple's link ${url} answers 404`);
    for (const record of records) {
      if (record.currencyCode && record.currencyCode !== store.currencyCode) throw new Error(`${url} is priced in ${record.currencyCode}, expected ${store.currencyCode}`);
      const prefix = appleModelPartNumberPrefix(record.partNumber);
      if (store.appleStoreId === 'us') macSpecsByAppleModelPartNumberPrefix.set(prefix, specsFromMacProductName(record.name, product.fixedSpecs));
      const pageAddressWords = decodeURIComponent(path.split('/').pop()!).replace(/-/g, ' ');
      const specs = macSpecsByAppleModelPartNumberPrefix.get(prefix) ?? usMacConfigurationMatchingLocalisedName(product, record.name || pageAddressWords);
      if (!specs) { warnings.push(`${store.appleStoreId} ${product.productId}: ${record.name || record.partNumber} matches no US configuration; skipped`); continue; }
      prices.push({ productId: product.productId, configurationId: configurationIdFromSpecs(specs), specs, price: record.price, sourcePageUrl: url, applePartNumber: record.partNumber });
    }
  });
  return { prices: lowestPricePerConfiguration(prices, `${store.appleStoreId} ${product.productId}`), notSold: false };
}

async function scrapeApplePencil(store: AppleOnlineStore, product: CatalogueProduct): Promise<ScrapedProduct> {
  const chooserUrl = `${store.storeUrl}/shop/${product.shopPath}`;
  const productPaths = await readApplePageCached(chooserUrl, page => isProductPageServed(page, product.shopPath) ? readLinkedPaths(page.html, 'shop/product/') : [],
    () => fetchApplePageConfirmingAbsence(chooserUrl, product.shopPath));
  const productPath = productPaths.find(path => path.toUpperCase().includes(`/${product.applePencilPartNumberStart}`));
  if (!productPath) return notSold;
  const url = `${store.storeUrl}/${productPath}`;
  const records = await readApplePageCached(url, page => {
    if (page.httpStatus !== 200) return [];
    const records = readApplePriceRecords(page.html);
    if (!records.length) throw new Error(`${url} has no price record`);
    return records;
  });
  if (!records.length) { warnings.push(`${store.appleStoreId} ${product.productId}: Apple's link ${url} answers 404`); return { prices: [], notSold: false }; }
  const specs = specsFromVariantDimensions({}, product.fixedSpecs);
  const [record] = records;
  return { prices: [{ productId: product.productId, configurationId: configurationIdFromSpecs(specs), specs, price: record.price, sourcePageUrl: url, applePartNumber: record.partNumber }], notSold: false };
}

function scrapeProduct(store: AppleOnlineStore, product: CatalogueProduct): Promise<ScrapedProduct> {
  if (product.pageKind === 'mac-standard-configuration-pages') return scrapeMacStandardConfigurations(store, product);
  if (product.pageKind === 'apple-pencil-product-pages') return scrapeApplePencil(store, product);
  return scrapeVariantTable(store, product);
}

const appleImageServer = 'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/';

async function productImageUrl(product: CatalogueProduct): Promise<string> {
  const usStoreUrl = appleOnlineStores[0].storeUrl;
  if (product.pageKind === 'priced-variant-table') {
    const html = (await fetchApplePage(`${usStoreUrl}/shop/${product.shopPath}`)).html;
    const filter = product.onlyVariantsWithDimension;
    const variant = readPricedVariants(readProductSelectionData(html) ?? {}).find(variant => variant.imageKey && (!filter || variant.dimensions[filter.dimension] === filter.value));
    if (variant) return `${appleImageServer}${variant.imageKey}`;
    // Watch pages name no image per case; their link preview shows the watch.
    const previewImage = /og:image" content="([^"?]+)/.exec(html)?.[1];
    if (previewImage?.startsWith(appleImageServer)) return previewImage;
  } else {
    const pagePath = product.pageKind === 'apple-pencil-product-pages'
      ? readLinkedPaths((await fetchApplePage(`${usStoreUrl}/shop/${product.shopPath}`)).html, 'shop/product/').find(path => path.toUpperCase().includes(`/${product.applePencilPartNumberStart}`))
      : readLinkedPaths((await fetchApplePage(`${usStoreUrl}/shop/${product.shopPath}`)).html, `shop/${product.shopPath}/`)[0];
    const imageUrl = pagePath && readApplePriceRecords((await fetchApplePage(`${usStoreUrl}/${pagePath}`)).html)[0]?.imageUrl;
    if (imageUrl) return imageUrl.split('?')[0];
  }
  throw new Error(`No product image found for ${product.productId}`);
}

async function checkedProductImageUrls(): Promise<Map<string, string>> {
  const imageUrls = new Map<string, string>();
  await forEachWithConcurrency(catalogueProducts, 2, async product => {
    const imageUrl = await productImageUrl(product);
    const response = await fetch(`${imageUrl}?wid=200&hei=200&fmt=png-alpha`);
    if (!response.ok || response.headers.get('content-type') !== 'image/png') throw new Error(`Apple's image for ${product.productId} is unavailable (HTTP ${response.status})`);
    imageUrls.set(product.productId, imageUrl);
  });
  return imageUrls;
}

// Macau has no online store, but Apple's Macau product pages state starting prices. Apple prices Macau like Hong Kong,
// whose dollar the pataca is pegged to, so the first price on the page close to Hong Kong's base price is the base price;
// that rejects the education, trade-in and sibling-product prices on the same page.
const macauPriceWordsToSkip = ['教育', '換購', '以舊換新', '優惠', '只需', '可享'];
const largestMacauDifferenceFromHongKong = 0.04;

async function scrapeMacauBasePrices(hongKongPrices: ScrapedShelfPrice[], hongKongDollarsPerPataca: number): Promise<ScrapedShelfPrice[]> {
  const prices: ScrapedShelfPrice[] = [];
  for (const product of catalogueProducts.filter(product => product.macauProductPagePath)) {
    const hongKongBase = hongKongPrices.filter(price => price.productId === product.productId).sort((a, b) => a.price - b.price)[0];
    if (!hongKongBase) continue;
    const url = `https://www.apple.com/mo/${product.macauProductPagePath}/`;
    const page = await fetchApplePage(url);
    if (page.httpStatus !== 200) continue;
    const text = readableText(page.html);
    const expectedPatacas = hongKongBase.price / hongKongDollarsPerPataca;
    const basePrice = [...text.matchAll(/MOP\$ ?([0-9,]+)/g)]
      .filter(match => !macauPriceWordsToSkip.some(word => text.slice(Math.max(0, match.index - 30), match.index).includes(word)))
      .map(match => Number(match[1].replace(/,/g, '')))
      .find(patacas => Math.abs(patacas / expectedPatacas - 1) < largestMacauDifferenceFromHongKong);
    if (basePrice) prices.push({ ...hongKongBase, price: basePrice, sourcePageUrl: url, applePartNumber: '' });
    else warnings.push(`mo ${product.productId}: no price on ${url} near Hong Kong's`);
  }
  return prices;
}

function californiaRecyclingFee(product: CatalogueProduct, price: ScrapedShelfPrice): number {
  const rule = product.californiaRecyclingFee;
  if (rule.kind === 'none') return 0;
  if (rule.kind === 'flat') return rule.dollars;
  if (rule.kind === 'percent-of-price') return Math.min(rule.maximumDollars, Math.round(price.price * rule.percent) / 100);
  if (!price.specs.screenSizeInches) throw new Error(`${product.productId} ${price.configurationId} needs a screen size for California's recycling fee`);
  return price.specs.screenSizeInches < 15 ? 4 : 5;
}

async function fetchExchangeRates() {
  const sourceUrl = 'https://open.er-api.com/v6/latest/USD';
  const response = await (await fetch(sourceUrl)).json();
  if (response.result !== 'success') throw new Error(`Exchange rates unavailable: ${JSON.stringify(response).slice(0, 200)}`);
  return create(ExchangeRatesSchema, {
    sourceName: 'ExchangeRate-API open access rates',
    sourceUrl,
    publishedAtUnixSeconds: BigInt(response.time_last_update_unix),
    rates: Object.entries(response.rates as Record<string, number>).map(([currencyCode, unitsPerUsDollar]) => create(CurrencyRateSchema, { currencyCode, unitsPerUsDollar })),
  });
}

function salesTaxRegions(appleStoreId: string, ratesByRegion: Record<string, [string, number]>, source: SalesTaxSource) {
  return Object.entries(ratesByRegion).map(([regionCode, [regionName, salesTaxPercent]]) =>
    create(SalesTaxRegionSchema, { regionCode, regionName, appleStoreId, salesTaxPercent, ...source }));
}

type StoreResult = { store: AppleOnlineStore; priceSourceKind: PriceSourceKind; prices: ScrapedShelfPrice[]; productIdsNotSold: string[] };

function problemsComparedWithPreviousSnapshot(previousSnapshot: PriceSnapshot | null, results: StoreResult[]): string[] {
  const problems: string[] = [];
  for (const previousStore of previousSnapshot?.appleStores ?? []) {
    const result = results.find(result => result.store.appleStoreId === previousStore.appleStoreId);
    const configurationsNow = new Set(result?.prices.map(price => `${price.productId} ${price.configurationId}`));
    for (const previousPrice of previousStore.shelfPrices) {
      const stillInCatalogue = catalogueProducts.some(product => product.productId === previousPrice.productId);
      const confirmedNotSold = result?.productIdsNotSold.includes(previousPrice.productId);
      if (configurationsNow.has(`${previousPrice.productId} ${previousPrice.configurationId}`) || !stillInCatalogue || confirmedNotSold) continue;
      problems.push(`${previousStore.appleStoreId} ${previousPrice.productId} ${previousPrice.configurationId} had a price last time and has none now`);
    }
  }
  return problems;
}

async function main() {
  const exchangeRates = await fetchExchangeRates();
  const unitsPerUsDollar = new Map(exchangeRates.rates.map(rate => [rate.currencyCode, rate.unitsPerUsDollar]));
  const productImageUrls = await checkedProductImageUrls();

  const results: StoreResult[] = [];
  const scrapeStore = async (store: AppleOnlineStore) => {
    const result: StoreResult = { store, priceSourceKind: PriceSourceKind.APPLE_ONLINE_STORE, prices: [], productIdsNotSold: [] };
    for (const product of catalogueProducts) {
      const scraped = await scrapeProduct(store, product);
      result.prices.push(...scraped.prices);
      if (scraped.notSold) result.productIdsNotSold.push(product.productId);
    }
    results.push(result);
    console.error(`${store.appleStoreId}: ${result.prices.length} prices`);
  };
  const [unitedStates, ...otherStores] = appleOnlineStores;
  await scrapeStore(unitedStates);
  await forEachWithConcurrency(otherStores, 2, scrapeStore);

  const hongKong = results.find(result => result.store.appleStoreId === 'hk')!;
  const macauStore: AppleOnlineStore = { appleStoreId: 'mo', countryCode: 'MO', currencyCode: 'MOP', storeUrl: 'https://www.apple.com/mo' };
  results.push({ store: macauStore, priceSourceKind: PriceSourceKind.APPLE_PRODUCT_PAGE, prices: await scrapeMacauBasePrices(hongKong.prices, unitsPerUsDollar.get('HKD')! / unitsPerUsDollar.get('MOP')!), productIdsNotSold: [] });
  const storeOrder = (result: StoreResult) => result.store === macauStore ? appleOnlineStores.length : appleOnlineStores.indexOf(result.store);
  results.sort((a, b) => storeOrder(a) - storeOrder(b));

  const usResult = results.find(result => result.store.appleStoreId === 'us')!;
  const usPrices = new Map(usResult.prices.map(price => [`${price.productId} ${price.configurationId}`, price.price]));
  const problems: string[] = [];
  for (const product of catalogueProducts) {
    if (!usResult.prices.some(price => price.productId === product.productId)) problems.push(`No US price for ${product.productId}`);
  }
  for (const { store, prices } of results) {
    const rate = unitsPerUsDollar.get(store.currencyCode);
    if (!rate) { problems.push(`No exchange rate for ${store.currencyCode}`); continue; }
    if (!prices.some(price => price.productId === 'iphone-17')) problems.push(`No iPhone 17 price in ${store.appleStoreId}`);
    for (const price of prices) {
      const usPrice = usPrices.get(`${price.productId} ${price.configurationId}`);
      const ratioToUs = usPrice ? price.price / rate / usPrice : 1;
      if (ratioToUs < 0.6 || ratioToUs > 3) problems.push(`${store.appleStoreId} ${price.productId} ${price.configurationId}: ${price.price} ${store.currencyCode} is ${ratioToUs.toFixed(2)}x the US price`);
    }
  }
  const previousSnapshot = await readFile(snapshotFile).then(bytes => fromBinary(PriceSnapshotSchema, bytes), () => null);
  const disappearances = problemsComparedWithPreviousSnapshot(previousSnapshot, results);
  if (process.argv.includes('--accept-missing-prices')) warnings.push(...disappearances);
  else problems.push(...disappearances.map(problem => `${problem} (Apple may be throttling: rerun, or pass --accept-missing-prices once you have checked Apple's page)`));
  for (const warning of warnings) console.error(`warning: ${warning}`);
  if (problems.length) throw new Error(`Snapshot not written:\n${problems.join('\n')}`);

  const configurationsByProduct = new Map<string, Map<string, { specs: ProductSpecs; sortPriceInUsDollars: number }>>();
  for (const { store, prices } of results) {
    for (const price of prices) {
      const configurations = configurationsByProduct.get(price.productId) ?? new Map();
      configurationsByProduct.set(price.productId, configurations);
      const priceInUsDollars = usPrices.get(`${price.productId} ${price.configurationId}`) ?? price.price / unitsPerUsDollar.get(store.currencyCode)!;
      const known = configurations.get(price.configurationId);
      if (!known || priceInUsDollars < known.sortPriceInUsDollars) configurations.set(price.configurationId, { specs: price.specs, sortPriceInUsDollars: priceInUsDollars });
    }
  }

  const snapshot = create(PriceSnapshotSchema, {
    fetchedAtUnixSeconds: BigInt(Math.floor(Date.now() / 1000)),
    products: catalogueProducts.map(product => create(ProductSchema, {
      productId: product.productId,
      productName: product.productName,
      category: product.category,
      appleImageUrl: productImageUrls.get(product.productId),
      configurations: [...configurationsByProduct.get(product.productId)!.entries()]
        .sort(([idA, a], [idB, b]) => a.sortPriceInUsDollars - b.sortPriceInUsDollars || idA.localeCompare(idB))
        .map(([configurationId, { specs }]) => create(ProductConfigurationSchema, { configurationId, specs })),
    })),
    appleStores: results.map(({ store, priceSourceKind, prices, productIdsNotSold }) => create(AppleStoreSchema, {
      appleStoreId: store.appleStoreId,
      countryCode: store.countryCode,
      currencyCode: store.currencyCode,
      storeUrl: store.storeUrl,
      priceSourceKind,
      shelfPriceIncludesSalesTax: !appleStoresAddingSalesTaxAtCheckout.has(store.appleStoreId),
      productIdsNotSold,
      shelfPrices: prices.map(price => create(ShelfPriceSchema, {
        productId: price.productId,
        configurationId: price.configurationId,
        priceInHundredths: BigInt(Math.round(price.price * 100)),
        sourcePageUrl: price.sourcePageUrl,
        applePartNumber: price.applePartNumber,
      })),
    })),
    salesTaxRegions: [
      ...salesTaxRegions('us', unitedStatesCombinedSalesTaxPercent, unitedStatesSalesTaxSource),
      ...salesTaxRegions('ca', canadaCombinedSalesTaxPercent, canadaSalesTaxSource),
    ],
    recyclingFees: [create(RecyclingFeeSchema, {
      regionCode: 'US-CA',
      feeName: 'California electronics recycling fee',
      sourceUrl: 'https://ecommerce2.apple.com/content/b2b/static-v2/en/US/EDU-K12/recyclefee.html',
      amounts: usResult.prices.map(price => ({ price, fee: californiaRecyclingFee(catalogueProducts.find(product => product.productId === price.productId)!, price) }))
        .filter(({ fee }) => fee > 0)
        .map(({ price, fee }) => create(RecyclingFeeAmountSchema, { productId: price.productId, configurationId: price.configurationId, feeInHundredths: BigInt(Math.round(fee * 100)) })),
    })],
    exchangeRates,
  });

  await writeFile(snapshotFile, toBinary(PriceSnapshotSchema, snapshot));
  const priceCount = snapshot.appleStores.reduce((total, store) => total + store.shelfPrices.length, 0);
  console.error(`Wrote ${snapshotFile.pathname}: ${snapshot.products.length} products, ${snapshot.appleStores.length} price sources, ${priceCount} prices`);
}

await main();
