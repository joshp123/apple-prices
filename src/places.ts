import type { PriceSnapshot } from './generated/apple_prices/v1/price_snapshot_pb.js';
import { countryName } from './take-home-prices.ts';

// A place is a country ("NL") or one of the states, provinces and territories Apple taxes separately ("US-OR", "CA-QC").
export const countriesTaxedByStateOrProvince = ['US', 'CA'];

// The map draws Palestine as one place.
const placeCodeDrawnForCountryCode: Record<string, string> = { IL: 'PS' };

export function placeCodeForCountryCode(countryCode: string): string {
  return placeCodeDrawnForCountryCode[countryCode] ?? countryCode;
}

export function countryCodeOf(placeCode: string): string {
  return placeCode.slice(0, 2);
}

export function isStateOrProvince(placeCode: string): boolean {
  return placeCode.includes('-');
}

export function placeName(snapshot: PriceSnapshot, placeCode: string): string {
  return snapshot.salesTaxRegions.find(region => region.regionCode === placeCode)?.regionName ?? countryName(placeCode);
}

const placeNamesSaidWithThe = /^(Netherlands|United|Philippines|Northwest Territories|District of Columbia|Yukon|Bahamas|Gambia|Maldives|Seychelles|Solomon|Comoros|Czech Republic|Dominican Republic|Central African Republic|Cayman|Falkland|Faroe|Marshall|Cook Islands|British Virgin|US Virgin|Isle of Man|Vatican)/;

// "in the Netherlands", "in Oregon".
export function placeNameAfterIn(snapshot: PriceSnapshot, placeCode: string): string {
  const name = placeName(snapshot, placeCode);
  return placeNamesSaidWithThe.test(name) ? `the ${name}` : name;
}

export function isKnownPlaceCode(snapshot: PriceSnapshot, placeCode: string): boolean {
  if (isStateOrProvince(placeCode)) return snapshot.salesTaxRegions.some(region => region.regionCode === placeCode);
  return /^[A-Z]{2}$/.test(placeCode) && countryName(placeCode) !== placeCode;
}

// Washington, DC is not a state, and Canada has provinces and territories.
export type StateOrProvinceWords = { one: string; chooseYours: string; all: string };
export function stateOrProvinceWords(countryCode: string): StateOrProvinceWords {
  return countryCode === 'US'
    ? { one: 'state', chooseYours: 'Choose your state', all: 'States and Washington, DC' }
    : { one: 'province or territory', chooseYours: 'Choose your province or territory', all: 'Provinces and territories' };
}

// Places that share the lowest price: US states with no sales tax, and Canadian provinces and territories with only the federal tax.
// The one most people live in is named.
const residentsInThousands: Record<string, number> = { 'US-OR': 4270, 'US-NH': 1410, 'US-MT': 1140, 'US-DE': 1050, 'CA-AB': 4890, 'CA-YT': 47, 'CA-NT': 45, 'CA-NU': 41 };

export function mostPopulousFirst<Place extends { territoryCode: string; territoryName: string }>(places: Place[]): Place[] {
  return [...places].sort((a, b) => (residentsInThousands[b.territoryCode] ?? 0) - (residentsInThousands[a.territoryCode] ?? 0) || a.territoryName.localeCompare(b.territoryName));
}
