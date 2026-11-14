// The answer: what it costs the visitor, then the cheapest place, any compared place and the most expensive place, always worldwide.
import { placeName, placeNameAfterIn, stateOrProvinceWords } from '../src/places.ts';
import { differenceFromVisitorWords, priceWords, salesTaxSentence, unpricedSentence, type ComparisonColumn, type PlacePrice, type PriceComparison } from '../src/price-comparison.ts';
import { escapeHtml, flagHtml, icons } from './html.ts';
import type { PageView } from './page-view.ts';

// The display currency first, then the place's own money in brackets. Neither amount ever breaks across lines.
export function amountsHtml(comparison: PriceComparison, placePrice: PlacePrice): string {
  const words = priceWords(comparison, placePrice);
  if (!words) return '';
  return `<span class="amount">${words.inDisplayCurrency}</span>${words.inLocalCurrency ? `<span class="amount-in-local-money">(${words.inLocalCurrency})</span>` : ''}`;
}

// A row names a place and its price. The compared place's row is itself the control that changes or removes the comparison.
function placeRowHtml({ snapshot, comparison, roleWording, visitorInComparisons, state }: PageView, column: ComparisonColumn): string {
  const name = placeName(snapshot, column.placeCode);
  const difference = column.placePrice.kind === 'priced' ? differenceFromVisitorWords(comparison, column.placePrice.price, visitorInComparisons) : '';
  const isCompared = column.role === 'compared';
  const placeControl = isCompared
    ? `<button type="button" class="row-place" data-action="open-panel" data-panel="compared-place" data-focus="row-compared" aria-haspopup="dialog" aria-expanded="${state.openPanel === 'compared-place'}" aria-label="Compared with ${escapeHtml(name)}. Change">`
    : `<button type="button" class="row-place" data-action="show-place" data-place="${column.placeCode}" data-from="price-line" data-focus="row-${column.role}">`;
  return `<div class="row">
    ${placeControl}
      ${flagHtml(column.placeCode, 'flag-in-row')}
      <span class="row-words"><span class="row-role">${roleWording[column.role]}</span><span class="row-name">${escapeHtml(name)}${isCompared ? icons.chevronDown : ''}</span></span>
    </button>
    <span class="row-price">${amountsHtml(comparison, column.placePrice)}${difference ? `<span class="row-difference">${difference}</span>` : ''}</span>
  </div>`;
}

// Before a comparison is chosen, its row is an empty place that opens the list of places.
const chooseComparisonRowHtml = ({ state }: PageView) => `<div class="row row-empty">
    <button type="button" class="row-place" data-action="open-panel" data-panel="compared-place" data-focus="open-compared-place" aria-haspopup="dialog" aria-expanded="${state.openPanel === 'compared-place'}">
      <span class="flag flag-in-row flag-empty" aria-hidden="true">${icons.plus}</span>
      <span class="row-words"><span class="row-role">Compare with</span><span class="row-name">Choose a place${icons.chevronDown}</span></span>
    </button>
  </div>`;

const amountSizeClass = (amount: string) => (amount.length > 12 ? 'amount-longest' : amount.length > 9 ? 'amount-longer' : amount.length > 7 ? 'amount-long' : '');

function visitorHtml({ snapshot, state, comparison, openerPlaceCode }: PageView): string {
  const visitor = comparison.columns.find(column => column.role === 'visitor');
  const useMyLocation = `<button type="button" class="button button-quiet" data-action="use-my-location">${icons.locate}<span>Use my location</span></button>`;
  const locationProblem = state.locationProblem ? `<p class="lead-method" role="status">${escapeHtml(state.locationProblem)}</p>` : '';
  if (!visitor) {
    return `<h1 class="lead-sentence lead-sentence-unpriced">Where are you?</h1>
      <div class="lead-actions"><button type="button" class="button" data-action="open-panel" data-panel="visitor-place" data-focus="open-visitor-place">Choose your place</button>${useMyLocation}</div>${locationProblem}`;
  }
  const place = visitor.placeCode, name = placeName(snapshot, place), price = visitor.placePrice;
  const productName = `<span translate="no">${escapeHtml(comparison.product.productName)}</span>`;
  // Someone else's link, opened in another country: the price is the shared place's, said so, with one way to the opener's own.
  const costsWhom = openerPlaceCode ? `costs in ${escapeHtml(placeNameAfterIn(snapshot, place))}` : 'costs you';
  const seeOwnPrice = openerPlaceCode
    ? `<div class="lead-actions"><button type="button" class="button-quiet" data-action="see-price-where-opened" data-focus="see-price-where-opened">See the price in ${escapeHtml(placeNameAfterIn(snapshot, openerPlaceCode))}</button></div>` : '';
  const where = `<button type="button" class="picker picker-place" data-action="open-panel" data-panel="visitor-place" data-focus="open-visitor-place" aria-haspopup="dialog" aria-expanded="${state.openPanel === 'visitor-place'}" aria-label="${openerPlaceCode ? 'This link shows' : 'You are in'} ${escapeHtml(name)}. Change">
    ${flagHtml(place, 'flag-in-lead')}<span class="picker-words">${escapeHtml(name)}</span>${icons.chevronDown}</button>`;
  const words = priceWords(comparison, price);
  if (price.kind === 'priced') {
    const method = salesTaxSentence(snapshot, price.price) || 'Including tax.';
    return `${where}<h1 class="lead-sentence">${productName} ${costsWhom}</h1>
      <p class="lead-price ${amountSizeClass(words!.inDisplayCurrency)}">${words!.inDisplayCurrency}</p>
      ${words!.inLocalCurrency ? `<p class="lead-price-in-local-money">${words!.inLocalCurrency}</p>` : ''}
      <button type="button" class="lead-method text-action" data-action="open-panel" data-panel="about-prices" data-focus="open-about-prices">${escapeHtml(method)}</button>${seeOwnPrice}`;
  }
  if (price.kind === 'priced-by-state-or-province') {
    const wording = stateOrProvinceWords(place);
    return `${where}<h1 class="lead-sentence">${productName} ${costsWhom}</h1>
      <p class="lead-price lead-price-range">${words!.inDisplayCurrency}</p>
      ${words!.inLocalCurrency ? `<p class="lead-price-in-local-money">${words!.inLocalCurrency}</p>` : ''}
      <p class="lead-method">It depends on ${openerPlaceCode ? 'the' : 'your'} ${wording.one}.${place === 'US' ? ' Sales tax is the population-weighted average for each state.' : ''}</p>
      <div class="lead-actions"><button type="button" class="button" data-action="open-panel" data-panel="visitor-place" data-place-list-country="${place}" data-focus="open-visitor-place-in-country">${wording.chooseYours}</button>${useMyLocation}</div>${locationProblem}${seeOwnPrice}`;
  }
  return `${where}<h1 class="lead-sentence lead-sentence-unpriced">${escapeHtml(unpricedSentence(comparison, price, place))}</h1>${seeOwnPrice}`;
}

// You, then the place you compare with, then the world's cheapest and most expensive.
export function answerHtml(view: PageView): string {
  const columnFor = (role: ComparisonColumn['role']) => view.comparison.columns.find(column => column.role === role);
  const compared = columnFor('compared');
  const rows = [compared ? placeRowHtml(view, compared) : chooseComparisonRowHtml(view), ...(['cheapest', 'most-expensive'] as const).map(columnFor).filter(column => !!column).map(column => placeRowHtml(view, column!))].join('');
  return `<div class="lead">${visitorHtml(view)}</div><div class="rows">${rows}</div>`;
}
