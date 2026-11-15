// What the page and the share card both say about one configuration: who is cheapest, what the visitor pays, the place they compare with, who is most expensive.
import { PriceSourceKind, type PriceSnapshot, type Product, type ProductConfiguration } from './generated/apple_prices/v1/price_snapshot_pb.js';
import { formatMoney } from './money.ts';
import { countriesTaxedByStateOrProvince, countryCodeOf, isStateOrProvince, mostPopulousFirst, placeNameAfterIn } from './places.ts';
import { storageWords } from './spec-words.ts';
import { cheapestAndMostExpensive, territoryPrices, unitsPerUsDollar, type TerritoryPrice } from './territory-prices.ts';

export type Selection = {
  productId: string;
  configurationId: string;
  // Not known until the visitor's country arrives, or when it cannot be found.
  visitorPlaceCode: string | null;
  comparedPlaceCode: string | null;
  displayCurrencyCode: string;
  // Tax included, as you pay to take it home, or before tax.
  pricesIncludeTax: boolean;
};

export type PlacePrice =
  | { kind: 'priced'; price: TerritoryPrice }
  // The United States or Canada as a whole: the price depends on the state or province.
  | { kind: 'priced-by-state-or-province'; lowest: TerritoryPrice; highest: TerritoryPrice; stateOrProvinceCount: number }
  | { kind: 'not-known-in-palestine' }
  // Before tax, where several taxes or a tax on import cannot be taken out of Apple's price at one rate.
  | { kind: 'not-known-before-tax'; whyNoSingleRate: string }
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
  prices: TerritoryPrice[];
  priceByPlaceCode: Map<string, TerritoryPrice>;
  cheapest: TerritoryPrice[];
  mostExpensive: TerritoryPrice[];
  highestPriceInUsDollars: number;
  columns: ComparisonColumn[];
};

const isSamePrice = (a: TerritoryPrice, b: TerritoryPrice) => Math.abs(a.amountInUsDollars - b.amountInUsDollars) < 0.005;

export function placePriceOf(snapshot: PriceSnapshot, product: Product, prices: TerritoryPrice[], placeCode: string): PlacePrice {
  const price = prices.find(candidate => candidate.territoryCode === placeCode);
  if (price) return { kind: 'priced', price };
  const statesOrProvinces = prices.filter(candidate => isStateOrProvince(candidate.territoryCode) && countryCodeOf(candidate.territoryCode) === placeCode);
  if (statesOrProvinces.length) return { kind: 'priced-by-state-or-province', lowest: statesOrProvinces[0], highest: statesOrProvinces[statesOrProvinces.length - 1], stateOrProvinceCount: statesOrProvinces.length };
  if (placeCode === 'PS') return { kind: 'not-known-in-palestine' };
  const store = snapshot.appleStores.find(candidate => candidate.countryCode === countryCodeOf(placeCode));
  if (!store) return { kind: 'no-apple-shop' };
  if (store.productIdsNotSold.includes(product.productId)) return { kind: 'not-sold' };
  // Prices before tax come from a price list that leaves such places out; the list's first entry says which kind it is.
  const isBeforeTax = prices[0] && !prices[0].includesTax, whyNoSingleRate = store.consumptionTax?.whyNoSingleRate;
  if (isBeforeTax && whyNoSingleRate && store.shelfPrices.some(shelfPrice => shelfPrice.productId === product.productId)) return { kind: 'not-known-before-tax', whyNoSingleRate };
  if (store.priceSourceKind !== PriceSourceKind.APPLE_PRODUCT_PAGE) return { kind: 'no-apple-price' };
  return store.shelfPrices.some(shelfPrice => shelfPrice.productId === product.productId) ? { kind: 'only-base-model-priced' } : { kind: 'no-apple-shop' };
}

export const hasPrice = (placePrice: PlacePrice) => placePrice.kind === 'priced' || placePrice.kind === 'priced-by-state-or-province';

function tiedPlacesWords(tied: TerritoryPrice[]): string {
  if (tied.length === 1) return '';
  const others = tied.length - 1;
  const allStates = tied.every(price => price.territoryCode.startsWith('US-') && price.territoryCode !== 'US-DC');
  return `and ${others} other ${allStates ? 'state' : 'place'}${others > 1 ? 's' : ''}`;
}

export function priceComparison(snapshot: PriceSnapshot, selection: Selection): PriceComparison {
  const product = snapshot.products.find(candidate => candidate.productId === selection.productId)!;
  const configuration = product.configurations.find(candidate => candidate.configurationId === selection.configurationId)!;
  const prices = territoryPrices(snapshot, product.productId, configuration.configurationId, selection.pricesIncludeTax);
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
    highestPriceInUsDollars: prices[prices.length - 1].amountInUsDollars,
  };
}

// A comparison is always with a place that has a price, and never with the visitor's own place.
export function canCompareWith(snapshot: PriceSnapshot, product: Product, prices: TerritoryPrice[], visitorPlaceCode: string | null, placeCode: string): boolean {
  return placeCode !== visitorPlaceCode && hasPrice(placePriceOf(snapshot, product, prices, placeCode));
}

export function amountInCurrency(snapshot: PriceSnapshot, price: TerritoryPrice, currencyCode: string): number {
  return price.currencyCode === currencyCode ? price.amount : price.amountInUsDollars * unitsPerUsDollar(snapshot, currencyCode);
}

// The display currency first, then the place's own currency where it differs.
export type PriceWords = { inDisplayCurrency: string; inLocalCurrency: string };

export function priceWords(comparison: PriceComparison, placePrice: PlacePrice, options?: { shortenMillions?: boolean }): PriceWords | null {
  const { snapshot, selection: { displayCurrencyCode } } = comparison;
  const words = (price: TerritoryPrice): PriceWords => ({
    inDisplayCurrency: formatMoney(amountInCurrency(snapshot, price, displayCurrencyCode), displayCurrencyCode, options),
    inLocalCurrency: price.currencyCode === displayCurrencyCode ? '' : formatMoney(price.amount, price.currencyCode, options),
  });
  if (placePrice.kind === 'priced') return words(placePrice.price);
  if (placePrice.kind !== 'priced-by-state-or-province') return null;
  const lowest = words(placePrice.lowest), highest = words(placePrice.highest);
  // Before tax every Canadian province has Apple's one price, so its range has nothing between its ends.
  if (lowest.inDisplayCurrency === highest.inDisplayCurrency) return lowest;
  return { inDisplayCurrency: `${lowest.inDisplayCurrency} to ${highest.inDisplayCurrency}`, inLocalCurrency: lowest.inLocalCurrency && `${lowest.inLocalCurrency} to ${highest.inLocalCurrency}` };
}

// US sales tax differs by city and county; the snapshot adds each state's population-weighted average.
const usesPopulationWeightedAverage = (price: TerritoryPrice) => !!price.salesTaxRegion?.salesTaxMethod.toLowerCase().includes('population-weighted average');

// How the price was reached. Only the United States and Canada need saying: everywhere else Apple's price is the price.
export function salesTaxSentence(snapshot: PriceSnapshot, price: TerritoryPrice): string {
  if (!price.includesTax) return beforeTaxSentence(snapshot, price);
  if (price.shelfPriceIncludesSalesTax) return '';
  if (!price.additionalSalesTaxPercent) return `No sales tax in ${placeNameAfterIn(snapshot, price.territoryCode)}.`;
  const applePrice = formatMoney(price.shelfPrice, price.currencyCode);
  const average = usesPopulationWeightedAverage(price) ? ' (population-weighted average)' : '';
  const recyclingFee = price.recyclingFee ? ` and a ${formatMoney(price.recyclingFee, price.currencyCode)} recycling fee` : '';
  return `Apple’s ${applePrice} plus ${price.additionalSalesTaxPercent}% sales tax${average}${recyclingFee}.`;
}

// How a price before tax was reached: Apple's price less the tax in it, or, where tax is added at checkout, Apple's price as it is.
function beforeTaxSentence(snapshot: PriceSnapshot, price: TerritoryPrice): string {
  const applePrice = formatMoney(price.shelfPrice, price.currencyCode), tax = price.consumptionTax;
  if (tax?.percent) return `Apple’s ${applePrice} less ${tax.percent}% ${tax.taxName}.`;
  if (tax) return `No consumption tax in ${placeNameAfterIn(snapshot, price.territoryCode)}.`;
  const recyclingFee = price.recyclingFee ? `, plus a ${formatMoney(price.recyclingFee, price.currencyCode)} recycling fee, which is not a tax` : '';
  return `Apple’s price before sales tax${recyclingFee}.`;
}

export function unpricedSentence(comparison: PriceComparison, placePrice: PlacePrice, placeCode: string): string {
  const place = placeNameAfterIn(comparison.snapshot, placeCode), productName = comparison.product.productName;
  switch (placePrice.kind) {
    case 'not-known-in-palestine': return 'We couldn’t find prices in occupied Palestine.';
    case 'not-known-before-tax': return `${place[0].toUpperCase()}${place.slice(1)}’s price before tax isn’t known: ${placePrice.whyNoSingleRate}.`;
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
    case 'not-known-before-tax': return 'Price before tax not known';
    case 'not-sold': return 'Not sold here';
    case 'only-base-model-priced': return 'Only base-model price available';
    case 'no-apple-shop': case 'no-apple-price': return 'No Apple price';
    default: return '';
  }
}

export function rankAmongPrices(comparison: PriceComparison, price: TerritoryPrice): number {
  return comparison.prices.findIndex(candidate => isSamePrice(candidate, price)) + 1;
}

// "$434 less than you" on the page, "$434 less than the Netherlands" when the page shows someone else's shared place,
// and just "$434 less" on the share card, where the column beside it is marked "Me".
export function differenceFromVisitorWords(comparison: PriceComparison, price: TerritoryPrice, thanWhom: string | null = 'you'): string {
  const visitor = comparison.columns.find(column => column.role === 'visitor')?.placePrice;
  if (visitor?.kind !== 'priced' || visitor.price.territoryCode === price.territoryCode) return '';
  if (isSamePrice(price, visitor.price)) return thanWhom ? `Same as ${thanWhom}` : 'Same price';
  const { snapshot, selection: { displayCurrencyCode } } = comparison;
  const amount = amountInCurrency(snapshot, price, displayCurrencyCode), visitorAmount = amountInCurrency(snapshot, visitor.price, displayCurrencyCode);
  const bothShownWhole = amount >= 100 && visitorAmount >= 100;
  const difference = bothShownWhole ? Math.round(amount) - Math.round(visitorAmount) : amount - visitorAmount;
  return `${formatMoney(Math.abs(difference), displayCurrencyCode, { shortenMillions: true, alwaysWhole: bothShownWhole })} ${difference < 0 ? 'less' : 'more'}${thanWhom ? ` than ${thanWhom}` : ''}`;
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
  return `${opening} Cheapest: ${cheapest.amount} in ${cheapest.place}. Most expensive: ${mostExpensive.amount} in ${mostExpensive.place}.${comparison.selection.pricesIncludeTax ? '' : ' Prices before tax.'}`;
}
