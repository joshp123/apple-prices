import { PriceSourceKind, type ConsumptionTax, type PriceSnapshot, type SalesTaxRegion } from './generated/apple_prices/v1/price_snapshot_pb.js';

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
  // The tax taken out of a shelf price that includes it, for a price before tax.
  consumptionTax?: ConsumptionTax;
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

// Before tax, a territory whose shelf price includes taxes that cannot be taken out at one rate (Brazil, Malaysia) has no price.
// California's recycling fee stays in a price before tax: it is a fee on the device, not a tax.
export function territoryPrices(snapshot: PriceSnapshot, productId: string, configurationId: string, includesTax = true): TerritoryPrice[] {
  const prices: TerritoryPrice[] = [];
  for (const store of snapshot.appleStores) {
    const shelfPriceEntry = store.shelfPrices.find(price => price.productId === productId && price.configurationId === configurationId);
    if (!shelfPriceEntry) continue;
    const shelfPrice = Number(shelfPriceEntry.priceInHundredths) / 100;
    const rate = unitsPerUsDollar(snapshot, store.currencyCode);
    const common = { currencyCode: store.currencyCode, priceSourceKind: store.priceSourceKind, shelfPrice, shelfPriceIncludesSalesTax: store.shelfPriceIncludesSalesTax, applePageUrl: shelfPriceEntry.sourcePageUrl, includesTax };
    const regions = snapshot.salesTaxRegions.filter(region => region.appleStoreId === store.appleStoreId);
    if (store.shelfPriceIncludesSalesTax || !regions.length) {
      const taxPercent = store.consumptionTax?.percent;
      if (!includesTax && store.shelfPriceIncludesSalesTax && taxPercent === undefined) continue;
      const amount = includesTax || !store.shelfPriceIncludesSalesTax ? shelfPrice : roundToCents(shelfPrice / (1 + taxPercent! / 100));
      prices.push({
        ...common, territoryCode: store.countryCode, territoryName: countryName(store.countryCode), additionalSalesTaxPercent: 0, recyclingFee: 0, recyclingFeeName: '',
        consumptionTax: includesTax ? undefined : store.consumptionTax, amount, amountInUsDollars: amount / rate,
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
        recyclingFee, recyclingFeeName: recyclingFee ? fee!.feeName : '', amount, amountInUsDollars: amount / rate,
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
