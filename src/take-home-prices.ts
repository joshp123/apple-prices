import { PriceSourceKind, type PriceSnapshot, type SalesTaxRegion } from './generated/apple_prices/v1/price_snapshot_pb.js';

// A territory is a country Apple prices, or a US state or Canadian province, where Apple adds tax at checkout.
export type TakeHomePrice = {
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
  takeHomePrice: number;
  takeHomePriceInUsDollars: number;
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

export function takeHomePrices(snapshot: PriceSnapshot, productId: string, configurationId: string): TakeHomePrice[] {
  const prices: TakeHomePrice[] = [];
  for (const store of snapshot.appleStores) {
    const shelfPriceEntry = store.shelfPrices.find(price => price.productId === productId && price.configurationId === configurationId);
    if (!shelfPriceEntry) continue;
    const shelfPrice = Number(shelfPriceEntry.priceInHundredths) / 100;
    const rate = unitsPerUsDollar(snapshot, store.currencyCode);
    const common = { currencyCode: store.currencyCode, priceSourceKind: store.priceSourceKind, shelfPrice, shelfPriceIncludesSalesTax: store.shelfPriceIncludesSalesTax };
    const regions = snapshot.salesTaxRegions.filter(region => region.appleStoreId === store.appleStoreId);
    if (store.shelfPriceIncludesSalesTax || !regions.length) {
      prices.push({ ...common, territoryCode: store.countryCode, territoryName: countryName(store.countryCode), additionalSalesTaxPercent: 0, recyclingFee: 0, recyclingFeeName: '', takeHomePrice: shelfPrice, takeHomePriceInUsDollars: shelfPrice / rate });
      continue;
    }
    for (const region of regions) {
      const fee = snapshot.recyclingFees.find(fee => fee.regionCode === region.regionCode);
      const feeAmount = fee?.amounts.find(amount => amount.productId === productId && amount.configurationId === configurationId);
      const recyclingFee = feeAmount ? Number(feeAmount.feeInHundredths) / 100 : 0;
      // Recycling fees are not taxed.
      const takeHomePrice = roundToCents(shelfPrice * (1 + region.salesTaxPercent / 100) + recyclingFee);
      prices.push({
        ...common, territoryCode: region.regionCode, territoryName: region.regionName, additionalSalesTaxPercent: region.salesTaxPercent, salesTaxRegion: region,
        recyclingFee, recyclingFeeName: recyclingFee ? fee!.feeName : '', takeHomePrice, takeHomePriceInUsDollars: takeHomePrice / rate,
      });
    }
  }
  return prices.sort((a, b) => a.takeHomePriceInUsDollars - b.takeHomePriceInUsDollars);
}

// Every territory sharing the lowest (or highest) price, since four US states have no sales tax and tie.
export function cheapestAndMostExpensive(prices: TakeHomePrice[]): { cheapest: TakeHomePrice[]; mostExpensive: TakeHomePrice[] } {
  const sameAs = (target: TakeHomePrice) => (price: TakeHomePrice) => Math.abs(price.takeHomePriceInUsDollars - target.takeHomePriceInUsDollars) < 0.005;
  return { cheapest: prices.filter(sameAs(prices[0])), mostExpensive: prices.filter(sameAs(prices[prices.length - 1])) };
}
