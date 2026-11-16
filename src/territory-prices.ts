import { PriceSourceKind, TaxBase, type ConsumptionTax, type PriceSnapshot, type Product, type SalesTaxRegion, type TaxOnSale } from './generated/apple_prices/v1/price_snapshot_pb.js';

// A territory is a country Apple prices, or a US state or Canadian province, where Apple adds tax at checkout. Its amount is what you pay
// to take the product home, or, before tax, that less the consumption tax in a shelf price or the sales tax added at checkout.
export type TerritoryPrice = {
  territoryCode: string;
  territoryName: string;
  currencyCode: string;
  priceSourceKind: PriceSourceKind;
  shelfPrice: number;
  shelfPriceIncludesSalesTax: boolean;
  additionalSalesTaxPercent: number;
  salesTaxRegion?: SalesTaxRegion;
  recyclingFee: number;
  recyclingFeeName: string;
  includesTax: boolean;
  // The taxes taken out of a shelf price that includes them, for a price before tax; empty where there are none, as in Hong Kong.
  taxesTakenOut: TaxOnSale[];
  amount: number;
  amountInUsDollars: number;
  applePageUrl: string;
};

const countryNames = new Intl.DisplayNames(['en-GB'], { type: 'region' });
const everydayCountryNames: Record<string, string> = { HK: 'Hong Kong', MO: 'Macau', TR: 'Turkey', PS: 'Palestine' };

export function countryName(countryCode: string): string {
  return everydayCountryNames[countryCode] ?? countryNames.of(countryCode) ?? countryCode;
}

export function unitsPerUsDollar(snapshot: PriceSnapshot, currencyCode: string): number {
  const rate = snapshot.exchangeRates?.rates.find(rate => rate.currencyCode === currencyCode)?.unitsPerUsDollar;
  if (!rate) throw new Error(`No exchange rate for ${currencyCode}`);
  return rate;
}

export function convertCurrency(snapshot: PriceSnapshot, amount: number, fromCurrencyCode: string, toCurrencyCode: string): number {
  return amount / unitsPerUsDollar(snapshot, fromCurrencyCode) * unitsPerUsDollar(snapshot, toCurrencyCode);
}

const roundToCents = (amount: number) => Math.round(amount * 100) / 100;

// Before tax, a territory whose taxes on this kind of product could not be confirmed has no price.
// California's recycling fee stays in a price before tax: it is a fee on the device, not a tax.
// The taxes on the sale of this product in a store whose shelf price includes them, or why they are not known.
export function taxesOnSale(tax: ConsumptionTax | undefined, product: Product): { taxes: TaxOnSale[] } | { whyNotKnown: string } {
  const row = tax?.productTaxes.find(candidate => candidate.productIds.includes(product.productId)) ?? tax?.productTaxes.find(candidate => candidate.categories.includes(product.category));
  if (row) return row.whyNotKnown ? { whyNotKnown: row.whyNotKnown } : { taxes: row.taxes };
  if (tax?.percent === undefined) return { whyNotKnown: tax?.whyNoSingleRate || 'its taxes could not be confirmed' };
  return { taxes: tax.percent ? [{ name: tax.taxName, percent: tax.percent, base: TaxBase.ADDED } as TaxOnSale] : [] };
}

// A price less its taxes: those added on top come off in turn, then the shares of the price, then the share of what is left.
function priceBeforeTaxes(price: number, taxes: TaxOnSale[]): number {
  const rate = (base: TaxBase) => taxes.filter(tax => tax.base === base).map(tax => tax.percent / 100);
  const added = rate(TaxBase.ADDED).reduce((product, each) => product * (1 + each), 1);
  const shareOfPrice = rate(TaxBase.SHARE_OF_PRICE).reduce((sum, each) => sum + each, 0), shareOfRevenue = rate(TaxBase.SHARE_OF_REVENUE).reduce((sum, each) => sum + each, 0);
  return (price / added - price * shareOfPrice) * (1 - shareOfRevenue);
}

export function territoryPrices(snapshot: PriceSnapshot, productId: string, configurationId: string, includesTax = true): TerritoryPrice[] {
  const prices: TerritoryPrice[] = [], product = snapshot.products.find(candidate => candidate.productId === productId)!;
  for (const store of snapshot.appleStores) {
    const shelfPriceEntry = store.shelfPrices.find(price => price.productId === productId && price.configurationId === configurationId);
    if (!shelfPriceEntry) continue;
    const shelfPrice = Number(shelfPriceEntry.priceInHundredths) / 100;
    const rate = unitsPerUsDollar(snapshot, store.currencyCode);
    const common = { currencyCode: store.currencyCode, priceSourceKind: store.priceSourceKind, shelfPrice, shelfPriceIncludesSalesTax: store.shelfPriceIncludesSalesTax, applePageUrl: shelfPriceEntry.sourcePageUrl, includesTax };
    const regions = snapshot.salesTaxRegions.filter(region => region.appleStoreId === store.appleStoreId);
    if (store.shelfPriceIncludesSalesTax || !regions.length) {
      const taxes = includesTax || !store.shelfPriceIncludesSalesTax ? { taxes: [] } : taxesOnSale(store.consumptionTax, product);
      if (!('taxes' in taxes)) continue;
      const amount = taxes.taxes.length ? roundToCents(priceBeforeTaxes(shelfPrice, taxes.taxes)) : shelfPrice;
      prices.push({
        ...common, territoryCode: store.countryCode, territoryName: countryName(store.countryCode), additionalSalesTaxPercent: 0, recyclingFee: 0, recyclingFeeName: '',
        taxesTakenOut: taxes.taxes, amount, amountInUsDollars: amount / rate,
      });
      continue;
    }
    for (const region of regions) {
      const fee = snapshot.recyclingFees.find(fee => fee.regionCode === region.regionCode);
      const feeAmount = fee?.amounts.find(amount => amount.productId === productId && amount.configurationId === configurationId);
      const recyclingFee = feeAmount ? Number(feeAmount.feeInHundredths) / 100 : 0;
      // Recycling fees are not taxed.
      const salesTaxPercent = includesTax ? region.salesTaxPercent : 0;
      const amount = roundToCents(shelfPrice * (1 + salesTaxPercent / 100) + recyclingFee);
      prices.push({
        ...common, territoryCode: region.regionCode, territoryName: region.regionName, additionalSalesTaxPercent: salesTaxPercent, salesTaxRegion: region,
        recyclingFee, recyclingFeeName: recyclingFee ? fee!.feeName : '', taxesTakenOut: [], amount, amountInUsDollars: amount / rate,
      });
    }
  }
  return prices.sort((a, b) => a.amountInUsDollars - b.amountInUsDollars);
}

// Every territory sharing the lowest (or highest) price, since four US states have no sales tax and tie.
export function cheapestAndMostExpensive(prices: TerritoryPrice[]): { cheapest: TerritoryPrice[]; mostExpensive: TerritoryPrice[] } {
  const sameAs = (target: TerritoryPrice) => (price: TerritoryPrice) => Math.abs(price.amountInUsDollars - target.amountInUsDollars) < 0.005;
  return { cheapest: prices.filter(sameAs(prices[0])), mostExpensive: prices.filter(sameAs(prices[prices.length - 1])) };
}
