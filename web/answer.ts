// The answer, laid over the map: the visitor, the place they compare with, and the world's cheapest and most expensive, in that order,
// each as a compact entry whose parts line up with the others'. The visitor's and the compared place are searchable lists.
import '@ui-sdk/web/combobox';
import '@ui-sdk/web/popover';
import type { UiComboboxElement } from '@ui-sdk/web';
import { countriesTaxedByStateOrProvince, countryCodeOf, isStateOrProvince, placeName, placeNameAfterIn, stateOrProvinceWords } from '../src/places.ts';
import { priceColour } from '../src/price-colour.ts';
import {
  canCompareWith, placePriceOf, priceWords, salesTaxLabel, salesTaxSentence, unpricedSentence, type ComparisonRole, type PlacePrice,
} from '../src/price-comparison.ts';
import { countryName } from '../src/take-home-prices.ts';
import { escapeHtml, flagHtml, icons } from './html.ts';
import { usEstimateNote, type PageView } from './page-view.ts';

export type PlacePickerPurpose = 'visitor' | 'compared';
const rolesInOrder: ComparisonRole[] = ['visitor', 'compared', 'cheapest', 'most-expensive'];

// A place list keeps one size and place while its results narrow, so the search field never moves under the visitor's typing:
// it opens above its place, as tall as the room there allows up to a limit, and never wider than the screen.
const placePickerHtml = (purpose: PlacePickerPurpose) => `<ui-combobox id="${purpose}-place" modal="pointer">
    <ui-combobox-trigger><button type="button" id="${purpose}-place-button" class="control control-place"></button></ui-combobox-trigger>
    <ui-combobox-content hidden anchor="#${purpose}-place-button" side="top" align="start" side-offset="6" collision-padding="8" class="list list-of-places">
      <div class="list-search"><ui-combobox-input><input autofocus name="${purpose}-place" autocomplete="off" spellcheck="false" placeholder="Search countries, states and provinces…" aria-label="Search countries, states and provinces"></ui-combobox-input></div>
      <div class="list-actions">${purpose === 'visitor' ? `<button type="button" class="text-action" data-action="use-my-location">${icons.locate}<span>Use my location</span></button><p class="list-note" role="status"></p>` : ''}<p class="list-qualifier">${usEstimateNote}</p></div>
      <ui-combobox-empty>No place with that name.</ui-combobox-empty>
      <ui-combobox-list></ui-combobox-list>
    </ui-combobox-content>
  </ui-combobox>`;

// Each place is one compact entry: what it is, the place, and its price with its local money. The details behind a price (how it
// differs from mine, how tax was reached) are in the place's pop-up on the map, so the map keeps the screen.
const columnHtml = (role: ComparisonRole) => `<div class="column column-${role}">
    <p class="column-role"></p>
    <div class="column-place">${role === 'visitor' || role === 'compared' ? placePickerHtml(role) : '<button type="button" class="place-name" data-action="show-place"></button>'}</div>
    <p class="column-price"></p>
  </div>`;

export const answerHtml = `<div class="band">${rolesInOrder.map(columnHtml).join('')}</div><div class="band-notice" role="status"></div>
  <ui-popover id="tax-details" presentation="auto">
    <ui-popover-content hidden class="pop-up pop-up-of-tax" side="top" align="start" side-offset="8">
      <ui-popover-title class="pop-up-title">Prices include tax</ui-popover-title><div class="tax-details"></div>
    </ui-popover-content>
  </ui-popover>`;

const placeWordsHtml = (placeCode: string, name: string) => `${flagHtml(placeCode, 'flag-in-column')}<span class="place-words">${escapeHtml(name)}</span>`;
const emptyPlaceHtml = (words: string) => `<span class="flag flag-in-column flag-empty" aria-hidden="true">${icons.plus}</span><span class="place-words">${words}</span>`;
const textAction = (action: string, words: string, extra = '') => `<button type="button" class="text-action" data-action="${action}"${extra}>${words}</button>`;

// A US state's price adds the population-weighted average of its sales taxes, so it is an estimate; the asterisk points to the
// map key, which says so.
const isEstimate = (placePrice: PlacePrice) => salesTaxLabel(placePrice) === 'Population-weighted average';

// What the visitor needs to know or do about their own place, when there is anything: choose a state, the price it could not find,
// or how to see their own price on someone else's link.
function noticeHtml({ snapshot, state, comparison, openerPlaceCode }: PageView): string {
  const visitor = comparison.columns.find(column => column.role === 'visitor');
  const useMyLocation = textAction('use-my-location', `${icons.locate}<span>Use my location</span>`);
  const parts: string[] = [];
  if (!visitor) parts.push('Where are you?', useMyLocation);
  else if (visitor.placePrice.kind === 'priced-by-state-or-province') {
    parts.push(textAction('open-visitor-place', stateOrProvinceWords(visitor.placeCode).chooseYours), useMyLocation);
  } else if (visitor.placePrice.kind !== 'priced') parts.push(escapeHtml(unpricedSentence(comparison, visitor.placePrice, visitor.placeCode)));
  if (openerPlaceCode) parts.push(`This link shows ${escapeHtml(placeNameAfterIn(snapshot, visitor!.placeCode))}.`, textAction('see-price-where-opened', `See the price in ${escapeHtml(placeNameAfterIn(snapshot, openerPlaceCode))}`));
  if (state.locationProblem) parts.push(`<span class="note-problem">${escapeHtml(state.locationProblem)}</span>`);
  return parts.map(part => `<span class="notice-part">${part}</span>`).join('');
}

export function drawAnswer(answer: HTMLElement, view: PageView): void {
  const { snapshot, state, comparison, roleWording, openerPlaceCode } = view;
  const cheapestInUsDollars = comparison.prices[0].takeHomePriceInUsDollars;
  for (const role of rolesInOrder) {
    const columnElement = answer.querySelector<HTMLElement>(`.column-${role}`)!, part = (name: string) => columnElement.querySelector<HTMLElement>(`.column-${name}`)!;
    // Amounts in the millions are shortened here, as on the map's labels; the place's pop-up has them in full.
    const column = comparison.columns.find(candidate => candidate.role === role), words = column && priceWords(comparison, column.placePrice, { shortenMillions: true });
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
    // The price in the map's colour for it, then the local money in brackets. A range may break between its ends, never inside one.
    const lowestInUsDollars = column?.placePrice.kind === 'priced' ? column.placePrice.price.takeHomePriceInUsDollars : column?.placePrice.kind === 'priced-by-state-or-province' ? column.placePrice.lowest.takeHomePriceInUsDollars : null;
    const swatch = lowestInUsDollars === null ? '' : `<span class="swatch" style="background:${priceColour(lowestInUsDollars, cheapestInUsDollars)}" aria-hidden="true"></span>`;
    const estimate = column && isEstimate(column.placePrice) ? '<span class="estimate-mark" aria-label=", population-weighted average sales tax">*</span>' : '';
    const amounts = words?.inDisplayCurrency.split(' to ').map(amount => `<span class="amount">${amount}</span>`).join(' <span class="range-to">to</span> ');
    const unpriced = column && !words ? '<span class="price-missing">No price</span>' : '';
    part('price').innerHTML = amounts
      ? `<span class="column-amount">${swatch}<span class="amounts">${amounts}${estimate}</span></span><span class="column-local">${words!.inLocalCurrency ? `(${words!.inLocalCurrency})` : ''}</span>`
      : `<span class="column-amount">${unpriced}</span><span class="column-local"></span>`;
    columnElement.classList.toggle('is-empty', !column);
  }
  const notice = answer.querySelector<HTMLElement>('.band-notice')!;
  notice.innerHTML = noticeHtml(view);
  notice.hidden = !notice.innerHTML;
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
  const hasUsEstimates = comparison.prices.some(price => salesTaxLabel({ kind: 'priced', price }) === 'Population-weighted average');
  return `${visitorSentence ? `<p class="tax-details-lead">${escapeHtml(visitorSentence)}</p>` : ''}${hasUsEstimates ? `<p class="tax-details-lead">* ${usEstimateNote}</p>` : ''}
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
