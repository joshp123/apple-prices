// The answer: four columns in a fixed order, the visitor, the place they compare with, and the world's cheapest and most expensive.
// Every column has the same rows, so a row's words line up across the page; the visitor's and the compared place are searchable lists.
import '@ui-sdk/web/combobox';
import '@ui-sdk/web/popover';
import type { UiComboboxElement } from '@ui-sdk/web';
import { countriesTaxedByStateOrProvince, countryCodeOf, isStateOrProvince, placeName, placeNameAfterIn, stateOrProvinceWords } from '../src/places.ts';
import { priceColour } from '../src/price-colour.ts';
import {
  canCompareWith, differenceFromVisitorWords, placePriceOf, priceWords, salesTaxSentence, unpricedSentence, type ComparisonColumn, type ComparisonRole, type PlacePrice,
} from '../src/price-comparison.ts';
import { countryName, type TakeHomePrice } from '../src/take-home-prices.ts';
import { escapeHtml, flagHtml, icons } from './html.ts';
import type { PageView } from './page-view.ts';

export type PlacePickerPurpose = 'visitor' | 'compared';
const rolesInOrder: ComparisonRole[] = ['visitor', 'compared', 'cheapest', 'most-expensive'];

const placePickerHtml = (purpose: PlacePickerPurpose) => `<ui-combobox id="${purpose}-place" presentation="auto">
    <ui-combobox-trigger><button type="button" id="${purpose}-place-button" class="control control-place"></button></ui-combobox-trigger>
    <ui-combobox-content hidden anchor="#${purpose}-place-button" align="start" side-offset="6" class="list list-of-places">
      <div class="list-search"><ui-combobox-input><input autofocus name="${purpose}-place" autocomplete="off" spellcheck="false" placeholder="Search countries, states and provinces…" aria-label="Search countries, states and provinces"></ui-combobox-input></div>
      ${purpose === 'visitor' ? `<div class="list-actions"><button type="button" class="text-action" data-action="use-my-location">${icons.locate}<span>Use my location</span></button><p class="list-note" role="status"></p></div>` : ''}
      <ui-combobox-empty>No place with that name.</ui-combobox-empty>
      <ui-combobox-list></ui-combobox-list>
    </ui-combobox-content>
  </ui-combobox>`;

const columnHtml = (role: ComparisonRole) => `<div class="column column-${role}">
    <p class="column-role"></p>
    <div class="column-place">${role === 'visitor' || role === 'compared' ? placePickerHtml(role) : '<button type="button" class="place-name" data-action="show-place"></button>'}</div>
    <p class="column-price"></p>
    <p class="column-local"></p>
    <div class="column-note"></div>
    <div class="column-meter" aria-hidden="true"><span class="column-meter-fill"></span></div>
  </div>`;

export const answerHtml = `<div class="band">${rolesInOrder.map(columnHtml).join('')}</div>
  <ui-popover id="tax-details" presentation="auto">
    <ui-popover-content hidden class="pop-up pop-up-of-tax" side="bottom" align="start" side-offset="8">
      <ui-popover-title class="pop-up-title">Prices include tax</ui-popover-title><div class="tax-details"></div>
    </ui-popover-content>
  </ui-popover>`;

const placeWordsHtml = (placeCode: string, name: string) => `${flagHtml(placeCode, 'flag-in-column')}<span class="place-words">${escapeHtml(name)}</span>`;
const emptyPlaceHtml = (words: string) => `<span class="flag flag-in-column flag-empty" aria-hidden="true">${icons.plus}</span><span class="place-words">${words}</span>`;
const textAction = (action: string, words: string, extra = '') => `<button type="button" class="text-action" data-action="${action}"${extra}>${words}</button>`;

// What the visitor's price includes, in a few words; the pop-up behind them says how it was worked out.
function taxWords(price: TakeHomePrice): string {
  if (price.shelfPriceIncludesSalesTax) return 'Including tax';
  if (!price.additionalSalesTaxPercent) return 'No sales tax';
  return `Including ${price.additionalSalesTaxPercent}% sales tax`;
}

// The share of the most expensive price, as a bar in the price's own map colour. A range of states shades from its lowest price's colour to its highest's.
function meterStyle({ comparison }: PageView, placePrice: PlacePrice | undefined): string {
  const range = placePrice?.kind === 'priced' ? [placePrice.price, placePrice.price] : placePrice?.kind === 'priced-by-state-or-province' ? [placePrice.lowest, placePrice.highest] : null;
  if (!range) return 'display:none';
  const cheapest = comparison.prices[0].takeHomePriceInUsDollars, highest = comparison.highestPriceInUsDollars;
  const [from, to] = range.map(price => price.takeHomePriceInUsDollars);
  const colours = [priceColour(from, cheapest), priceColour(to, cheapest)];
  return `--meter-end:${to / highest * 100}%;--meter-colour-start:${colours[0]};--meter-colour-end:${colours[1]};--meter-colour-from:${from / to * 100}%`;
}

function noteHtml(view: PageView, column: ComparisonColumn | undefined, role: ComparisonRole): string {
  const { snapshot, state, comparison, openerPlaceCode, visitorInComparisons } = view;
  const useMyLocation = textAction('use-my-location', `${icons.locate}<span>Use my location</span>`);
  const locationProblem = state.locationProblem ? `<span class="note-problem" role="status">${escapeHtml(state.locationProblem)}</span>` : '';
  const seeOwnPrice = openerPlaceCode ? textAction('see-price-where-opened', `See the price in ${escapeHtml(placeNameAfterIn(snapshot, openerPlaceCode))}`) : '';
  const price = column?.placePrice;
  if (role !== 'visitor') {
    if (price?.kind === 'priced') return escapeHtml(differenceFromVisitorWords(comparison, price.price, visitorInComparisons));
    return price?.kind === 'priced-by-state-or-province' ? `Depends on the ${stateOrProvinceWords(column!.placeCode).one}` : '';
  }
  if (!price) return `<span class="note-actions">${useMyLocation}</span>${locationProblem}`;
  if (price.kind === 'priced') {
    const taxDetails = `<ui-popover-trigger for="tax-details"><button type="button" class="text-action">${taxWords(price.price)}</button></ui-popover-trigger>`;
    return `<span class="note-actions">${taxDetails}${seeOwnPrice}</span>`;
  }
  if (price.kind === 'priced-by-state-or-province') {
    const chooseYours = textAction('open-visitor-place', stateOrProvinceWords(column!.placeCode).chooseYours);
    return `<span class="note-actions">${chooseYours}${useMyLocation}${seeOwnPrice}</span>${locationProblem}`;
  }
  return `<span class="note-actions">${seeOwnPrice}</span>`;
}

// Prices in the band share one size, the size the longest of them fits at.
const amountLength = (words: string) => (words.length > 13 ? 'longest' : words.length > 10 ? 'longer' : words.length > 8 ? 'long' : 'short');

export function drawAnswer(answer: HTMLElement, view: PageView): void {
  const { snapshot, state, comparison, roleWording, openerPlaceCode } = view;
  let longestAmount = '';
  for (const role of rolesInOrder) {
    const columnElement = answer.querySelector<HTMLElement>(`.column-${role}`)!, part = (name: string) => columnElement.querySelector<HTMLElement>(`.column-${name}`)!;
    const column = comparison.columns.find(candidate => candidate.role === role), words = column && priceWords(comparison, column.placePrice);
    part('role').textContent = roleWording[role];
    const place = column ? placeWordsHtml(column.placeCode, placeName(snapshot, column.placeCode)) : emptyPlaceHtml(role === 'visitor' ? 'Choose your place' : 'Choose a place');
    if (role === 'visitor' || role === 'compared') {
      const button = columnElement.querySelector<HTMLButtonElement>(`#${role}-place-button`)!;
      button.innerHTML = place;
      const whose = role === 'visitor' ? (openerPlaceCode ? 'This link shows' : 'You are in') : 'Compared with';
      button.setAttribute('aria-label', column ? `${whose} ${placeName(snapshot, column.placeCode)}. Change` : role === 'visitor' ? 'Choose your place' : 'Compare with a place');
    } else {
      const button = part('place').querySelector<HTMLButtonElement>('.place-name')!;
      button.innerHTML = place;
      button.dataset.place = column!.placeCode;
      button.setAttribute('aria-label', `${roleWording[role]}: ${placeName(snapshot, column!.placeCode)}. Show on the map`);
    }
    const unpriced = column && !words ? unpricedSentence(comparison, column.placePrice, column.placeCode) : role === 'visitor' && !column ? 'Where are you?' : '';
    const nothingChosen = role === 'compared' && !column ? '<span class="price-missing price-missing-quiet">Any country, state or province</span>' : '';
    part('price').innerHTML = words ? `<span class="amount">${words.inDisplayCurrency}</span>` : nothingChosen || `<span class="price-missing">${escapeHtml(unpriced)}</span>`;
    part('price').classList.toggle('column-price-range', column?.placePrice.kind === 'priced-by-state-or-province');
    part('local').textContent = words?.inLocalCurrency ? `(${words.inLocalCurrency})` : '';
    part('note').innerHTML = noteHtml(view, column, role);
    part('meter').querySelector<HTMLElement>('.column-meter-fill')!.style.cssText = meterStyle(view, column?.placePrice);
    if (words && column!.placePrice.kind === 'priced' && words.inDisplayCurrency.length > longestAmount.length) longestAmount = words.inDisplayCurrency;
  }
  answer.querySelector<HTMLElement>('.band')!.dataset.amountLength = amountLength(longestAmount);
  answer.querySelector('.tax-details')!.innerHTML = taxDetailsHtml(view);
  for (const purpose of ['visitor', 'compared'] as const) {
    const picker = answer.querySelector<UiComboboxElement>(`#${purpose}-place`)!;
    const value = (purpose === 'visitor' ? state.visitorPlaceCode : state.comparedPlaceCode) ?? null;
    if (picker.value !== value) picker.value = value;
  }
  const listNote = answer.querySelector('.list-note');
  if (listNote) listNote.textContent = state.locationProblem;
}

const dayWords = (unixSeconds: bigint) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Number(unixSeconds) * 1000));

function taxDetailsHtml({ snapshot, comparison }: PageView): string {
  const usRegion = snapshot.salesTaxRegions.find(region => region.regionCode.startsWith('US-'))!, canadianRegion = snapshot.salesTaxRegions.find(region => region.regionCode.startsWith('CA-'))!;
  const rates = snapshot.exchangeRates!;
  const source = (name: string, url: string) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`;
  const visitor = comparison.columns.find(column => column.role === 'visitor')?.placePrice;
  const visitorSentence = visitor?.kind === 'priced' ? salesTaxSentence(snapshot, visitor.price) : '';
  return `${visitorSentence ? `<p class="tax-details-lead">${escapeHtml(visitorSentence)}</p>` : ''}
    <p>Every price is Apple’s own, from its online store in each place, and is what you pay to take the product home.</p>
    <p>In most countries Apple’s price already includes tax. In the United States Apple adds sales tax at checkout, which differs by city and county, so each state’s price uses its population-weighted average sales tax (${source(usRegion.sourceName, usRegion.sourceUrl)}, rates from ${escapeHtml(usRegion.ratesEffectiveDate)}). In Canada each province’s and territory’s price adds its sales taxes (${source(canadianRegion.sourceName, canadianRegion.sourceUrl)}).</p>
    <p>Apple’s prices were read on ${dayWords(snapshot.fetchedAtUnixSeconds)}. Other currencies use exchange rates from ${source(rates.sourceName, rates.sourceUrl)}, ${dayWords(rates.publishedAtUnixSeconds)}.</p>`;
}

// Filled when a list opens, since its prices and order depend on what is chosen then. Every country comes first, then the states and
// provinces, each named with its country, so a search for "Ontario" finds it; a visitor in the United States or Canada sees its own first.
// Places to compare with are cheapest first, so the list is also the ranking of every price.
export function placeListHtml(view: PageView, purpose: PlacePickerPurpose, countryCodesOnMap: string[]): string {
  const { snapshot, state, comparison } = view;
  const placePrice = (code: string) => placePriceOf(snapshot, comparison.product, comparison.prices, code);
  const countryCodes = [...new Set([...countryCodesOnMap, ...countriesTaxedByStateOrProvince, ...snapshot.appleStores.map(store => store.countryCode)])]
    .filter(code => countryName(code) !== code);
  const regionCodes = snapshot.salesTaxRegions.map(region => region.regionCode);
  const label = (code: string) => (isStateOrProvince(code) ? `${placeName(snapshot, code)}, ${placeName(snapshot, countryCodeOf(code))}` : placeName(snapshot, code));
  const byName = (a: string, b: string) => label(a).localeCompare(label(b));
  const item = (code: string) => `<ui-combobox-item value="${code}" label="${escapeHtml(label(code))}">${flagHtml(code, 'flag-in-list')}<span class="item-words">${escapeHtml(label(code))}</span>`
    + `<span class="item-amount">${priceWords(comparison, placePrice(code), { shortenMillions: true })?.inDisplayCurrency ?? ''}</span><ui-combobox-item-indicator></ui-combobox-item-indicator></ui-combobox-item>`;
  const group = (title: string, codes: string[]) => (codes.length ? `<ui-combobox-group><ui-combobox-group-label>${title}</ui-combobox-group-label>${codes.map(item).join('')}</ui-combobox-group>` : '');
  if (purpose === 'compared') {
    const lowestPriceInUsDollars = (code: string) => { const price = placePrice(code); return price.kind === 'priced' ? price.price.takeHomePriceInUsDollars : price.kind === 'priced-by-state-or-province' ? price.lowest.takeHomePriceInUsDollars : Infinity; };
    const codes = [...countryCodes, ...regionCodes].filter(code => canCompareWith(snapshot, comparison.product, comparison.prices, state.visitorPlaceCode, code))
      .sort((a, b) => lowestPriceInUsDollars(a) - lowestPriceInUsDollars(b) || byName(a, b));
    const noComparison = state.comparedPlaceCode ? '<ui-combobox-item value="none" label="No comparison"><span class="item-words">No comparison</span></ui-combobox-item>' : '';
    return noComparison + group('Cheapest first', codes);
  }
  const visitorCountry = state.visitorPlaceCode && countryCodeOf(state.visitorPlaceCode);
  const ownRegions = countriesTaxedByStateOrProvince.includes(visitorCountry ?? '') ? regionCodes.filter(code => countryCodeOf(code) === visitorCountry).sort(byName) : [];
  return group(ownRegions.length ? stateOrProvinceWords(visitorCountry!).all : '', ownRegions)
    + group('Countries', countryCodes.sort(byName))
    + group('States and provinces', regionCodes.filter(code => !ownRegions.includes(code)).sort(byName));
}

export const placePicker = (answer: HTMLElement, purpose: PlacePickerPurpose) => answer.querySelector<UiComboboxElement>(`#${purpose}-place`)!;
