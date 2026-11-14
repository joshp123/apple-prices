// The price line: every place at its price on one money axis, cheapest on the left. The page and the share card both draw it.
import { formatMoney } from './money.ts';
import { countryCodeOf, isStateOrProvince, placeName } from './places.ts';
import { placePriceOf, type ComparisonRole, type PlacePrice, type PriceComparison } from './price-comparison.ts';
import { unitsPerUsDollar, type TakeHomePrice } from './take-home-prices.ts';

export type PlacesOnPriceLine = 'countries' | 'states-and-provinces';

// A place on the line, or the United States or Canada as the span of what its states or provinces pay.
export type PriceLineMark = {
  placeCode: string;
  placeName: string;
  lowestPriceInUsDollars: number;
  highestPriceInUsDollars: number;
  placePrice: PlacePrice;
  // Empty for a place that is neither the visitor's, the compared one, the cheapest nor the most expensive.
  roles: ComparisonRole[];
  // "Cheapest" only ever means worldwide; among states and provinces the words say so.
  roleWords: string;
  tiedPlacesWords: string;
};

export type RoleWording = Record<ComparisonRole, string>;
export const roleWordingOnPage: RoleWording = { cheapest: 'Cheapest', visitor: 'You', compared: 'Compared with', 'most-expensive': 'Most expensive' };
export const roleWordingOnShareCard: RoleWording = { cheapest: 'Cheapest', visitor: 'Me', compared: 'Compared with', 'most-expensive': 'Most expensive' };

const joinedRoleWords = (words: string[]) => words.map((each, index) => (index ? each.charAt(0).toLowerCase() + each.slice(1) : each)).join(' and ');

export function priceLineMarks(comparison: PriceComparison, placesShown: PlacesOnPriceLine, roleWording: RoleWording): PriceLineMark[] {
  const { snapshot, prices, columns } = comparison;
  const marks = new Map<string, PriceLineMark>();
  const markFor = (price: TakeHomePrice): PriceLineMark => ({
    placeCode: price.territoryCode, placeName: price.territoryName, lowestPriceInUsDollars: price.takeHomePriceInUsDollars, highestPriceInUsDollars: price.takeHomePriceInUsDollars,
    placePrice: { kind: 'priced', price }, roles: [], roleWords: '', tiedPlacesWords: '',
  });
  const columnOf = (placeCode: string) => columns.filter(column => column.placeCode === placeCode);

  if (placesShown === 'states-and-provinces') {
    const shown = prices.filter(price => isStateOrProvince(price.territoryCode));
    for (const price of shown) marks.set(price.territoryCode, markFor(price));
    const amongThese = 'US state or Canadian province';
    const endOfLine = (role: 'cheapest' | 'most-expensive', priceAtEnd: TakeHomePrice): void => {
      const worldwide = columns.find(column => column.role === role)!;
      const mark = marks.get(worldwide.placeCode) ?? marks.get(priceAtEnd.territoryCode)!;
      mark.roles.push(role);
      mark.tiedPlacesWords ||= mark.placeCode === worldwide.placeCode ? worldwide.tiedPlacesWords : '';
      mark.roleWords = mark.placeCode === worldwide.placeCode ? roleWording[role] : `${roleWording[role]} ${amongThese}`;
    };
    if (shown.length) { endOfLine('cheapest', shown[0]); endOfLine('most-expensive', shown[shown.length - 1]); }
    for (const mark of marks.values()) {
      const personalRoles = columnOf(mark.placeCode).map(column => column.role).filter(role => role === 'visitor' || role === 'compared');
      if (!personalRoles.length) continue;
      mark.roleWords = joinedRoleWords([...personalRoles.map(role => roleWording[role]), ...(mark.roleWords ? [mark.roleWords] : [])]);
      mark.roles.unshift(...personalRoles);
    }
    return [...marks.values()];
  }

  for (const price of prices) {
    if (!isStateOrProvince(price.territoryCode)) { marks.set(price.territoryCode, markFor(price)); continue; }
    const countryCode = countryCodeOf(price.territoryCode);
    const country = marks.get(countryCode);
    // Prices come cheapest first, so each later state or province is the country's highest so far.
    if (country) country.highestPriceInUsDollars = price.takeHomePriceInUsDollars;
    else marks.set(countryCode, { ...markFor(price), placeCode: countryCode, placeName: placeName(snapshot, countryCode), placePrice: placePriceOf(snapshot, comparison.product, prices, countryCode) });
    if (columnOf(price.territoryCode).length) marks.set(price.territoryCode, markFor(price));
  }
  for (const mark of marks.values()) {
    const placeColumns = columnOf(mark.placeCode);
    mark.roles = placeColumns.map(column => column.role);
    mark.roleWords = joinedRoleWords(mark.roles.map(role => roleWording[role]));
    mark.tiedPlacesWords = placeColumns.find(column => column.tiedPlacesWords)?.tiedPlacesWords ?? '';
  }
  return [...marks.values()];
}

export type PriceLineScale = { lowestPriceInUsDollars: number; highestPriceInUsDollars: number; positionOf: (priceInUsDollars: number) => number };

// Positions run from the margin to the line's width less the margin, in true proportion to price.
export function priceLineScale(marks: PriceLineMark[], lineWidth: number, marginAtEachEnd: number): PriceLineScale {
  const lowest = Math.min(...marks.map(mark => mark.lowestPriceInUsDollars)), highest = Math.max(...marks.map(mark => mark.highestPriceInUsDollars));
  const positionOf = (priceInUsDollars: number) => (highest === lowest ? lineWidth / 2 : marginAtEachEnd + (priceInUsDollars - lowest) / (highest - lowest) * (lineWidth - 2 * marginAtEachEnd));
  return { lowestPriceInUsDollars: lowest, highestPriceInUsDollars: highest, positionOf };
}

export type PriceLineTick = { position: number; words: string };

// Round amounts in the display currency.
export function priceLineTicks(comparison: PriceComparison, scale: PriceLineScale, mostTicks: number): PriceLineTick[] {
  const currencyCode = comparison.selection.displayCurrencyCode, rate = unitsPerUsDollar(comparison.snapshot, currencyCode);
  const lowest = scale.lowestPriceInUsDollars * rate, highest = scale.highestPriceInUsDollars * rate;
  if (highest <= lowest) return [];
  const roughStep = (highest - lowest) / mostTicks, magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 2.5, 5, 10].map(multiple => multiple * magnitude).find(candidate => candidate >= roughStep)!;
  const ticks: PriceLineTick[] = [];
  for (let amount = Math.ceil(lowest / step) * step; amount <= highest; amount += step) ticks.push({ position: scale.positionOf(amount / rate), words: formatMoney(amount, currencyCode, { shortenMillions: true }) });
  return ticks;
}

// Flags hang under the line at their exact price. One that would touch another hangs a row lower, never to the side.
export function rowsForHangingFlags(spans: { left: number; right: number }[], gapBetweenFlags: number): number[] {
  const placedByRow: { left: number; right: number }[][] = [];
  return spans.map(span => {
    let row = 0;
    while (placedByRow[row]?.some(placed => span.left < placed.right + gapBetweenFlags && span.right > placed.left - gapBetweenFlags)) row++;
    (placedByRow[row] ??= []).push(span);
    return row;
  });
}
