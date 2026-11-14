import { ProductCategory, type ProductSpecs } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';

export type ProductPageKind =
  // A table of part numbers or watch cases with prices on the product's own store page.
  | 'priced-variant-table'
  // Each Mac standard configuration has its own store page with Apple's product record.
  | 'mac-standard-configuration-pages'
  // Apple Pencil: product records linked from the Apple Pencil chooser page.
  | 'apple-pencil-product-pages';

// From Apple's own schedule: https://ecommerce2.apple.com/content/b2b/static-v2/en/US/EDU-K12/recyclefee.html
export type CaliforniaRecyclingFeeRule =
  | { kind: 'none' }
  | { kind: 'flat'; dollars: number }
  | { kind: 'four-dollars-under-15-inches-else-five' }
  | { kind: 'percent-of-price'; percent: number; maximumDollars: number };

const noFee: CaliforniaRecyclingFeeRule = { kind: 'none' };
const feeByScreenSize: CaliforniaRecyclingFeeRule = { kind: 'four-dollars-under-15-inches-else-five' };
const batteryProductFee: CaliforniaRecyclingFeeRule = { kind: 'percent-of-price', percent: 1.5, maximumDollars: 15 };

export type CatalogueProduct = {
  productId: string;
  productName: string;
  category: ProductCategory;
  shopPath: string;
  pageKind: ProductPageKind;
  // Specs every configuration shares, from Apple's tech-spec pages; they fill in what store pages leave out.
  fixedSpecs: Partial<Omit<ProductSpecs, '$typeName'>>;
  californiaRecyclingFee: CaliforniaRecyclingFeeRule;
  // Apple's Macau product page, which states a starting price although Macau has no online store.
  macauProductPagePath?: string;
  onlyVariantsWithDimension?: { dimension: string; value: string };
  applePencilPartNumberStart?: string;
};

type Extras = Partial<Pick<CatalogueProduct, 'macauProductPagePath' | 'onlyVariantsWithDimension' | 'applePencilPartNumberStart'>>;

function variantTable(productId: string, productName: string, category: ProductCategory, shopPath: string, fixedSpecs: CatalogueProduct['fixedSpecs'], californiaRecyclingFee: CaliforniaRecyclingFeeRule, extras: Extras = {}): CatalogueProduct {
  return { productId, productName, category, shopPath, pageKind: 'priced-variant-table', fixedSpecs, californiaRecyclingFee, ...extras };
}

function macFamily(productId: string, productName: string, fixedSpecs: CatalogueProduct['fixedSpecs'], californiaRecyclingFee: CaliforniaRecyclingFeeRule, macauProductPagePath?: string): CatalogueProduct {
  return { productId, productName, category: ProductCategory.MAC, shopPath: `buy-mac/${productId}`, pageKind: 'mac-standard-configuration-pages', fixedSpecs, californiaRecyclingFee, macauProductPagePath };
}

function applePencil(productId: string, productName: string, applePencilPartNumberStart: string): CatalogueProduct {
  return { productId, productName, category: ProductCategory.ACCESSORY, shopPath: 'select-apple-pencil', pageKind: 'apple-pencil-product-pages', fixedSpecs: {}, californiaRecyclingFee: batteryProductFee, macauProductPagePath: 'apple-pencil', applePencilPartNumberStart };
}

// Apple's flagship hardware on 14 Nov 2026.
export const catalogueProducts: CatalogueProduct[] = [
  variantTable('iphone-18-pro', 'iPhone 18 Pro', ProductCategory.IPHONE, 'buy-iphone/iphone-18-pro', { chip: 'A20 Pro' }, batteryProductFee, { macauProductPagePath: 'iphone-18-pro', onlyVariantsWithDimension: { dimension: 'Screensize', value: '6_3inch' } }),
  variantTable('iphone-18-pro-max', 'iPhone 18 Pro Max', ProductCategory.IPHONE, 'buy-iphone/iphone-18-pro', { chip: 'A20 Pro' }, batteryProductFee, { onlyVariantsWithDimension: { dimension: 'Screensize', value: '6_9inch' } }),
  variantTable('iphone-duo', 'iPhone Duo', ProductCategory.IPHONE, 'buy-iphone/iphone-duo', { chip: 'A20 Pro' }, batteryProductFee, { macauProductPagePath: 'iphone-duo' }),
  variantTable('iphone-air', 'iPhone Air', ProductCategory.IPHONE, 'buy-iphone/iphone-air', { chip: 'A19 Pro' }, batteryProductFee, { macauProductPagePath: 'iphone-air' }),
  variantTable('iphone-17', 'iPhone 17', ProductCategory.IPHONE, 'buy-iphone/iphone-17', { chip: 'A19' }, batteryProductFee, { macauProductPagePath: 'iphone-17' }),
  variantTable('iphone-17e', 'iPhone 17e', ProductCategory.IPHONE, 'buy-iphone/iphone-17e', { chip: 'A19' }, batteryProductFee, { macauProductPagePath: 'iphone-17e' }),
  variantTable('ipad-pro', 'iPad Pro', ProductCategory.IPAD, 'buy-ipad/ipad-pro', { chip: 'M5' }, feeByScreenSize, { macauProductPagePath: 'ipad-pro' }),
  variantTable('ipad-air', 'iPad Air', ProductCategory.IPAD, 'buy-ipad/ipad-air', { chip: 'M4' }, feeByScreenSize, { macauProductPagePath: 'ipad-air' }),
  variantTable('ipad', 'iPad', ProductCategory.IPAD, 'buy-ipad/ipad', { chip: 'A16', screenSizeInches: 11 }, feeByScreenSize, { macauProductPagePath: 'ipad-11' }),
  variantTable('ipad-mini', 'iPad mini', ProductCategory.IPAD, 'buy-ipad/ipad-mini', { chip: 'A20 Pro', screenSizeInches: 8.3 }, feeByScreenSize, { macauProductPagePath: 'ipad-mini' }),
  macFamily('macbook-neo', 'MacBook Neo', { chip: 'A18 Pro', cpuCoreCount: 6, gpuCoreCount: 5, memoryGigabytes: 8, screenSizeInches: 13 }, feeByScreenSize, 'macbook-neo'),
  macFamily('macbook-air', 'MacBook Air', {}, feeByScreenSize, 'macbook-air'),
  macFamily('macbook-pro', 'MacBook Pro (Liquid Retina XDR)', {}, feeByScreenSize, 'macbook-pro'),
  macFamily('macbook-pro-proled-xdr', 'MacBook Pro (PROLED XDR)', {}, feeByScreenSize, 'macbook-pro'),
  macFamily('imac', 'iMac', { screenSizeInches: 24 }, feeByScreenSize, 'imac'),
  macFamily('mac-mini', 'Mac mini', {}, noFee, 'mac-mini'),
  macFamily('mac-studio', 'Mac Studio', {}, noFee, 'mac-studio'),
  variantTable('studio-display', 'Studio Display', ProductCategory.DISPLAY, 'buy-mac/studio-display', { screenSizeInches: 27 }, feeByScreenSize, { macauProductPagePath: 'studio-display' }),
  variantTable('studio-display-xdr', 'Studio Display XDR', ProductCategory.DISPLAY, 'buy-mac/studio-display-xdr', {}, { kind: 'flat', dollars: 5 }),
  variantTable('apple-watch-series-12', 'Apple Watch Series 12', ProductCategory.WATCH, 'buy-watch/apple-watch', { chip: 'S11' }, batteryProductFee, { macauProductPagePath: 'apple-watch-series-12' }),
  variantTable('apple-watch-ultra-4', 'Apple Watch Ultra 4', ProductCategory.WATCH, 'buy-watch/apple-watch-ultra', { chip: 'S11' }, batteryProductFee, { macauProductPagePath: 'apple-watch-ultra-4' }),
  variantTable('apple-watch-se-3', 'Apple Watch SE 3', ProductCategory.WATCH, 'buy-watch/apple-watch-se', { chip: 'S10' }, batteryProductFee, { macauProductPagePath: 'apple-watch-se-3' }),
  variantTable('apple-vision-pro', 'Apple Vision Pro', ProductCategory.VISION, 'buy-vision/apple-vision-pro', { chip: 'M5' }, { kind: 'flat', dollars: 4 }),
  variantTable('airpods-5', 'AirPods 5', ProductCategory.AIRPODS, 'buy-airpods/airpods-5', {}, batteryProductFee, { macauProductPagePath: 'airpods-4' }),
  variantTable('airpods-pro-3', 'AirPods Pro 3', ProductCategory.AIRPODS, 'buy-airpods/airpods-pro-3', {}, batteryProductFee, { macauProductPagePath: 'airpods-pro' }),
  variantTable('airpods-max-2', 'AirPods Max 2', ProductCategory.AIRPODS, 'buy-airpods/airpods-max-2', {}, batteryProductFee, { macauProductPagePath: 'airpods-max' }),
  variantTable('homepod', 'HomePod', ProductCategory.HOME, 'buy-homepod/homepod', {}, noFee),
  variantTable('homepod-mini-2', 'HomePod mini 2', ProductCategory.HOME, 'buy-homepod/homepod-mini', {}, noFee),
  variantTable('apple-homeview', 'Apple HomeView', ProductCategory.HOME, 'buy-home/apple-homeview', {}, noFee),
  variantTable('apple-tv-4k', 'Apple TV 4K', ProductCategory.HOME, 'buy-tv/apple-tv-4k', { chip: 'A19', storageGigabytes: 128 }, noFee),
  variantTable('airtag', 'AirTag', ProductCategory.ACCESSORY, 'buy-airtag/airtag', {}, noFee, { macauProductPagePath: 'airtag' }),
  applePencil('apple-pencil-pro', 'Apple Pencil Pro', 'MX2D3'),
  applePencil('apple-pencil-usb-c', 'Apple Pencil (USB-C)', 'MUWA3'),
];
