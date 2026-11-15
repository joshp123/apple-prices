// What opens over the page: the pop-up for one place on the map, and the share dialog.
import '@ui-sdk/web/button';
import '@ui-sdk/web/dialog';
import '@ui-sdk/web/popover';
import '@ui-sdk/web/textarea';
import { placeName, stateOrProvinceWords } from '../src/places.ts';
import { canCompareWith, differenceFromVisitorWords, placePriceOf, priceWords, salesTaxSentence, shareSentence, unpricedSentence } from '../src/price-comparison.ts';
import { postPicturePath, shareLinkPath } from '../src/share-link.ts';
import { escapeHtml, flagHtml, icons } from './html.ts';
import type { PageView } from './page-view.ts';

export const popUpsHtml = `
  <ui-popover id="place-pop-up" presentation="auto">
    <ui-popover-content hidden class="pop-up pop-up-of-place" side="top" side-offset="14" collision-padding="12"></ui-popover-content>
  </ui-popover>
  <ui-dialog id="share-dialog" presentation="auto">
    <ui-dialog-backdrop hidden class="backdrop"></ui-dialog-backdrop>
    <ui-dialog-content hidden class="dialog" initial-focus="#share-text"></ui-dialog-content>
  </ui-dialog>`;

const actionButton = (words: string, attributes: string, isPrimary = false) =>
  `<ui-button><button type="button" class="control${isPrimary ? ' control-primary' : ''}" ${attributes}>${words}</button></ui-button>`;

export function placePopUpHtml({ snapshot, state, comparison, openerPlaceCode, visitorInComparisons }: PageView, placeCode: string): string {
  const price = placePriceOf(snapshot, comparison.product, comparison.prices, placeCode), name = placeName(snapshot, placeCode), words = priceWords(comparison, price);
  const isVisitorPlace = placeCode === state.visitorPlaceCode, isComparedPlace = placeCode === state.comparedPlaceCode;
  const inLocalMoney = words?.inLocalCurrency ? `<span class="pop-up-local">(${words.inLocalCurrency})</span>` : '';
  const lines: string[] = [];
  if (price.kind === 'priced') {
    lines.push(differenceFromVisitorWords(comparison, price.price, visitorInComparisons), isVisitorPlace ? (openerPlaceCode ? 'This is the place the link shows.' : 'This is where you are.') : '', salesTaxSentence(snapshot, price.price));
  } else if (price.kind === 'priced-by-state-or-province') {
    lines.push(`It depends on the ${stateOrProvinceWords(placeCode).one}.${placeCode === 'US' ? ' Sales tax is the population-weighted average for each state.' : ''}`);
  }
  const body = words
    ? `<p class="pop-up-price"><span class="amount">${words.inDisplayCurrency}</span>${inLocalMoney}</p>${lines.filter(Boolean).map(line => `<p class="pop-up-line">${escapeHtml(line)}</p>`).join('')}`
    : `<p class="pop-up-no-price">${escapeHtml(unpricedSentence(comparison, price, placeCode))}</p>`;
  const canCompare = canCompareWith(snapshot, comparison.product, comparison.prices, state.visitorPlaceCode, placeCode);
  const actions = [
    canCompare && !isComparedPlace ? actionButton(`Compare with ${state.visitorPlaceCode ? escapeHtml(visitorInComparisons) : 'this place'}`, `data-action="compare-with" data-place="${placeCode}"`, true) : '',
    isComparedPlace ? actionButton('Stop comparing', 'data-action="compare-with" data-place=""') : '',
    price.kind === 'priced-by-state-or-province' ? actionButton(`Show the ${placeCode === 'US' ? 'states' : 'provinces'}`, `data-action="show-map-area" data-area="${placeCode === 'US' ? 'united-states' : 'canada'}"`) : '',
    !isVisitorPlace ? actionButton('I’m here', `data-action="choose-visitor-place" data-place="${placeCode}"`) : '',
  ].join('');
  const seeAtApple = price.kind === 'priced' ? `<a class="pop-up-link" href="${escapeHtml(price.price.applePageUrl)}" target="_blank" rel="noopener">See it at Apple</a>` : '';
  return `<div class="pop-up-head">${flagHtml(placeCode, 'flag-in-pop-up')}<ui-popover-title class="pop-up-title">${escapeHtml(name)}</ui-popover-title>
      <ui-popover-close><button type="button" class="icon-button" aria-label="Close">${icons.close}</button></ui-popover-close></div>
    ${body}${actions ? `<div class="pop-up-actions">${actions}</div>` : ''}${seeAtApple}`;
}

export const shareLink = ({ state }: PageView) => `${location.origin}${shareLinkPath(state)}`;
export const shareTextSuggested = ({ comparison }: PageView) => shareSentence(comparison);

// X shows the link's picture beside the post. The words are the visitor's own, exactly as typed; none at all is allowed.
export function postOnTwitterLink(view: PageView, text: string): string {
  const parameters = new URLSearchParams({ url: shareLink(view) });
  if (text) parameters.set('text', text);
  return `https://x.com/intent/post?${parameters}`;
}

export function shareDialogHtml(view: PageView): string {
  const text = view.state.shareTextAsTyped ?? shareTextSuggested(view), picturePath = postPicturePath(view.state);
  return `<div class="dialog-head"><ui-dialog-title class="dialog-title">Share these prices</ui-dialog-title>
      <ui-dialog-close><button type="button" class="icon-button" aria-label="Close">${icons.close}</button></ui-dialog-close></div>
    <div class="dialog-body">
      <img class="share-card" src="${escapeHtml(picturePath)}" width="1400" height="1600" alt="The picture that goes with your post: ${escapeHtml(shareTextSuggested(view))}">
      <div class="share-side">
        <label class="field-label" for="share-text">Your post</label>
        <ui-textarea><textarea id="share-text" name="post" rows="5" autocomplete="off" data-input="share-text">${escapeHtml(text)}</textarea></ui-textarea>
        <p class="share-link" translate="no">${escapeHtml(shareLink(view).replace(/^https?:\/\//, ''))}</p>
        <div class="share-actions">
          <a class="control control-primary" id="post-on-twitter" href="${escapeHtml(postOnTwitterLink(view, text))}" target="_blank" rel="noopener">Post on Twitter</a>
          ${actionButton('Copy link', 'data-action="copy-share-link"')}
          ${actionButton('Copy picture', 'data-action="copy-share-card"')}
          <a class="control" href="${escapeHtml(picturePath)}" download="apple-prices-${view.state.productId}.png">Save picture</a>
        </div>
        <p class="share-status" role="status"></p>
      </div>
    </div>`;
}
