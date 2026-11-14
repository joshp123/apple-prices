// What the page and the share card both say about one configuration: who is cheapest, what the visitor pays, the place they compare with, who is most expensive.
import { PriceSourceKind, type PriceSnapshot, type Product, type ProductConfiguration } from './generated/apple_prices/v1/price_snapshot_pb.js';
import { formatMoney } from './money.ts';
import { countriesTaxedByStateOrProvince, countryCodeOf, isStateOrProvince, mostPopulousFirst, placeNameAfterIn } from './places.ts';
import { storageWords } from './spec-words.ts';
import { cheapestAndMostExpensive, takeHomePrices, unitsPerUsDollar, type TakeHomePrice } from './take-home-prices.ts';

export type Selection = {
  productId: string;
  configurationId: string;
  // Not known until the visitor's country arrives, or when it cannot be found.
  visitorPlaceCode: string | null;
  comparedPlaceCode: string | null;
  displayCurrencyCode: string;
};

export type PlacePrice =
  | { kind: 'priced'; price: TakeHomePrice }
  // The United States or Canada as a whole: the price depends on the state or province.
  | { kind: 'priced-by-state-or-province'; lowest: TakeHomePrice; highest: TakeHomePrice; stateOrProvinceCount: number }
  | { kind: 'not-known-in-palestine' }
  | { kind: 'not-sold' }
  | { kind: 'only-base-model-priced' }
  | { kind: 'no-apple-shop' }
  | { kind: 'no-apple-price' };

export type ComparisonRole = 'cheapest' | 'visitor' | 'compared' | 'most-expensive';
export type ComparisonColumn = { role: ComparisonRole; placeCode: string; placePrice: PlacePrice; tiedPlacesWords: string };

export type PriceComparison = {
  snapshot: PriceSnapshot;
  selection: Selection;
  product: Product;
  configuration: ProductConfiguration;
  // Cheapest first.
  prices: TakeHomePrice[];
  priceByPlaceCode: Map<string, TakeHomePrice>;
  cheapest: TakeHomePrice[];
  mostExpensive: TakeHomePrice[];
  highestPriceInUsDollars: number;
  columns: ComparisonColumn[];
};

const isSamePrice = (a: TakeHomePrice, b: TakeHomePrice) => Math.abs(a.takeHomePriceInUsDollars - b.takeHomePriceInUsDollars) < 0.005;

export function placePriceOf(snapshot: PriceSnapshot, product: Product, prices: TakeHomePrice[], placeCode: string): PlacePrice {
  const price = prices.find(candidate => candidate.territoryCode === placeCode);
  if (price) return { kind: 'priced', price };
  const statesOrProvinces = prices.filter(candidate => isStateOrProvince(candidate.territoryCode) && countryCodeOf(candidate.territoryCode) === placeCode);
  if (statesOrProvinces.length) return { kind: 'priced-by-state-or-province', lowest: statesOrProvinces[0], highest: statesOrProvinces[statesOrProvinces.length - 1], stateOrProvinceCount: statesOrProvinces.length };
  if (placeCode === 'PS') return { kind: 'not-known-in-palestine' };
  const store = snapshot.appleStores.find(candidate => candidate.countryCode === countryCodeOf(placeCode));
  if (!store) return { kind: 'no-apple-shop' };
  if (store.productIdsNotSold.includes(product.productId)) return { kind: 'not-sold' };
  if (store.priceSourceKind !== PriceSourceKind.APPLE_PRODUCT_PAGE) return { kind: 'no-apple-price' };
  return store.shelfPrices.some(shelfPrice => shelfPrice.productId === product.productId) ? { kind: 'only-base-model-priced' } : { kind: 'no-apple-shop' };
}

export const hasPrice = (placePrice: PlacePrice) => placePrice.kind === 'priced' || placePrice.kind === 'priced-by-state-or-province';

function tiedPlacesWords(tied: TakeHomePrice[]): string {
  if (tied.length === 1) return '';
  const others = tied.length - 1;
  const allStates = tied.every(price => price.territoryCode.startsWith('US-') && price.territoryCode !== 'US-DC');
  return `and ${others} other ${allStates ? 'state' : 'place'}${others > 1 ? 's' : ''}`;
}

export function priceComparison(snapshot: PriceSnapshot, selection: Selection): PriceComparison {
  const product = snapshot.products.find(candidate => candidate.productId === selection.productId)!;
  const configuration = product.configurations.find(candidate => candidate.configurationId === selection.configurationId)!;
  const prices = takeHomePrices(snapshot, product.productId, configuration.configurationId);
  const { cheapest, mostExpensive } = cheapestAndMostExpensive(prices);
  const cheapestNamed = mostPopulousFirst(cheapest)[0], mostExpensiveNamed = mostPopulousFirst(mostExpensive)[0];
  const columnFor = (role: ComparisonRole, placeCode: string): ComparisonColumn => ({ role, placeCode, placePrice: placePriceOf(snapshot, product, prices, placeCode), tiedPlacesWords: '' });
  const columns: ComparisonColumn[] = [{ ...columnFor('cheapest', cheapestNamed.territoryCode), tiedPlacesWords: tiedPlacesWords(cheapest) }];
  if (selection.visitorPlaceCode) columns.push(columnFor('visitor', selection.visitorPlaceCode));
  if (selection.comparedPlaceCode) columns.push(columnFor('compared', selection.comparedPlaceCode));
  columns.push({ ...columnFor('most-expensive', mostExpensiveNamed.territoryCode), tiedPlacesWords: tiedPlacesWords(mostExpensive) });
  return {
    snapshot, selection, product, configuration, prices, cheapest, mostExpensive, columns,
    priceByPlaceCode: new Map(prices.map(price => [price.territoryCode, price])),
    highestPriceInUsDollars: prices[prices.length - 1].takeHomePriceInUsDollars,
  };
}

// A comparison is always with a place that has a price, and never with the visitor's own place.
export function canCompareWith(snapshot: PriceSnapshot, product: Product, prices: TakeHomePrice[], visitorPlaceCode: string | null, placeCode: string): boolean {
  return placeCode !== visitorPlaceCode && hasPrice(placePriceOf(snapshot, product, prices, placeCode));
}

export function amountInCurrency(snapshot: PriceSnapshot, price: TakeHomePrice, currencyCode: string): number {
  return price.currencyCode === currencyCode ? price.takeHomePrice : price.takeHomePriceInUsDollars * unitsPerUsDollar(snapshot, currencyCode);
}

// The display currency first, then the place's own currency where it differs.
export type PriceWords = { inDisplayCurrency: string; inLocalCurrency: string };

export function priceWords(comparison: PriceComparison, placePrice: PlacePrice, options?: { shortenMillions?: boolean }): PriceWords | null {
  const { snapshot, selection: { displayCurrencyCode } } = comparison;
  const words = (price: TakeHomePrice): PriceWords => ({
    inDisplayCurrency: formatMoney(amountInCurrency(snapshot, price, displayCurrencyCode), displayCurrencyCode, options),
    inLocalCurrency: price.currencyCode === displayCurrencyCode ? '' : formatMoney(price.takeHomePrice, price.currencyCode, options),
  });
  if (placePrice.kind === 'priced') return words(placePrice.price);
  if (placePrice.kind !== 'priced-by-state-or-province') return null;
  const lowest = words(placePrice.lowest), highest = words(placePrice.highest);
  return { inDisplayCurrency: `${lowest.inDisplayCurrency} to ${highest.inDisplayCurrency}`, inLocalCurrency: lowest.inLocalCurrency && `${lowest.inLocalCurrency} to ${highest.inLocalCurrency}` };
}

// US sales tax differs by city and county; the snapshot adds each state's population-weighted average.
const usesPopulationWeightedAverage = (price: TakeHomePrice) => !!price.salesTaxRegion?.salesTaxMethod.toLowerCase().includes('population-weighted average');

export function salesTaxLabel(placePrice: PlacePrice): string {
  if (placePrice.kind === 'priced-by-state-or-province') return usesPopulationWeightedAverage(placePrice.highest) ? 'Population-weighted average' : '';
  if (placePrice.kind !== 'priced' || !usesPopulationWeightedAverage(placePrice.price)) return '';
  return placePrice.price.additionalSalesTaxPercent ? 'Population-weighted average' : 'No sales tax';
}

// How the price was reached. Only the United States and Canada need saying: everywhere else Apple's price is the price.
export function salesTaxSentence(snapshot: PriceSnapshot, price: TakeHomePrice): string {
  if (price.shelfPriceIncludesSalesTax) return '';
  if (!price.additionalSalesTaxPercent) return `No sales tax in ${placeNameAfterIn(snapshot, price.territoryCode)}.`;
  const applePrice = formatMoney(price.shelfPrice, price.currencyCode);
  const average = usesPopulationWeightedAverage(price) ? ' (population-weighted average)' : '';
  const recyclingFee = price.recyclingFee ? ` and a ${formatMoney(price.recyclingFee, price.currencyCode)} recycling fee` : '';
  return `Apple’s ${applePrice} plus ${price.additionalSalesTaxPercent}% sales tax${average}${recyclingFee}.`;
}

export function unpricedSentence(comparison: PriceComparison, placePrice: PlacePrice, placeCode: string): string {
  const place = placeNameAfterIn(comparison.snapshot, placeCode), productName = comparison.product.productName;
  switch (placePrice.kind) {
    case 'not-known-in-palestine': return 'We couldn’t find prices in occupied Palestine.';
    case 'not-sold': return `Apple doesn’t sell ${productName} in ${place}.`;
    case 'only-base-model-priced': return 'Only base-model price available';
    case 'no-apple-shop': return `Apple has no online shop in ${place}.`;
    case 'no-apple-price': return `Apple shows no price for ${productName} in ${place}.`;
    default: return '';
  }
}

export function unpricedWordsOnShareCard(placePrice: PlacePrice): string {
  switch (placePrice.kind) {
    case 'not-known-in-palestine': return 'Prices in occupied Palestine not known';
    case 'not-sold': return 'Not sold here';
    case 'only-base-model-priced': return 'Only base-model price available';
    case 'no-apple-shop': case 'no-apple-price': return 'No Apple price';
    default: return '';
  }
}

export function rankAmongPrices(comparison: PriceComparison, price: TakeHomePrice): number {
  return comparison.prices.findIndex(candidate => isSamePrice(candidate, price)) + 1;
}

// "$434 less than you" on the page; the share card speaks for the visitor: "than me".
export function differenceFromVisitorWords(comparison: PriceComparison, price: TakeHomePrice, visitorWord: 'you' | 'me' = 'you'): string {
  const visitor = comparison.columns.find(column => column.role === 'visitor')?.placePrice;
  if (visitor?.kind !== 'priced' || visitor.price.territoryCode === price.territoryCode) return '';
  if (isSamePrice(price, visitor.price)) return `Same as ${visitorWord}`;
  const { snapshot, selection: { displayCurrencyCode } } = comparison;
  const amount = amountInCurrency(snapshot, price, displayCurrencyCode), visitorAmount = amountInCurrency(snapshot, visitor.price, displayCurrencyCode);
  const bothShownWhole = amount >= 100 && visitorAmount >= 100;
  const difference = bothShownWhole ? Math.round(amount) - Math.round(visitorAmount) : amount - visitorAmount;
  return `${formatMoney(Math.abs(difference), displayCurrencyCode, { shortenMillions: true, alwaysWhole: bothShownWhole })} ${difference < 0 ? 'less' : 'more'} than ${visitorWord}`;
}

export function shareSentence(comparison: PriceComparison): string {
  const { snapshot, product, configuration, columns } = comparison;
  const specs = configuration.specs!, storage = specs.storageGigabytes && !specs.memoryGigabytes ? ` (${storageWords(specs.storageGigabytes)})` : '';
  const sentenceFor = (role: ComparisonRole) => {
    const column = columns.find(candidate => candidate.role === role);
    const words = column && column.placePrice.kind === 'priced' && priceWords(comparison, column.placePrice);
    return words ? { amount: words.inDisplayCurrency, place: placeNameAfterIn(snapshot, column.placeCode) } : null;
  };
  const visitor = sentenceFor('visitor'), cheapest = sentenceFor('cheapest')!, mostExpensive = sentenceFor('most-expensive')!;
  const opening = visitor ? `${product.productName}${storage} costs ${visitor.amount} in ${visitor.place}.` : `${product.productName}${storage}.`;
  return `${opening} Cheapest: ${cheapest.amount} in ${cheapest.place}. Most expensive: ${mostExpensive.amount} in ${mostExpensive.place}.`;
}
