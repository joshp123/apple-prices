// The panels that open over the page: the lists to choose from, how prices are worked out, the pop-up for one place and the share dialog.
import countryToCurrency from 'country-to-currency';
import { ProductCategory } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { widelyHeldCurrencyCodes } from '../src/money.ts';
import { countriesTaxedByStateOrProvince, countryCodeOf, isStateOrProvince, placeName, stateOrProvinceWords } from '../src/places.ts';
import { priceColour } from '../src/price-colour.ts';
import {
  canCompareWith, differenceFromVisitorWords, placePriceOf, priceComparison, priceWords, salesTaxSentence, shareSentence, unpricedSentence,
} from '../src/price-comparison.ts';
import { priceLineMarks, type PriceLineMark } from '../src/price-line.ts';
import { shareCardPath, shareLinkPath } from '../src/share-link.ts';
import { specLine } from '../src/spec-words.ts';
import { countryName } from '../src/take-home-prices.ts';
import { escapeHtml, flagHtml, icons } from './html.ts';
import { placesShownOnPriceLine, type PageView } from './page-view.ts';
import { currencyWords, listsWholeConfigurations, specChoicesHtml } from './product-bar.ts';

const panelHeadHtml = (title: string) => `<div class="panel-head"><h2 class="panel-title">${title}</h2><button type="button" class="button button-quiet" data-action="close-panel">Done</button></div>`;

const categoryTitles: [ProductCategory, string][] = [
  [ProductCategory.IPHONE, 'iPhone'], [ProductCategory.IPAD, 'iPad'], [ProductCategory.MAC, 'Mac'], [ProductCategory.DISPLAY, 'Displays'], [ProductCategory.WATCH, 'Watch'],
  [ProductCategory.VISION, 'Vision'], [ProductCategory.AIRPODS, 'AirPods'], [ProductCategory.HOME, 'TV and Home'], [ProductCategory.ACCESSORY, 'Accessories'],
];

// What another product or configuration costs the visitor, to help them choose.
function priceForVisitor({ snapshot, state }: PageView, productId: string, configurationId: string): string {
  if (!state.visitorPlaceCode) return '';
  const other = priceComparison(snapshot, { ...state, productId, configurationId, comparedPlaceCode: null });
  const visitor = other.columns.find(column => column.role === 'visitor')!;
  return priceWords(other, visitor.placePrice, { shortenMillions: true })?.inDisplayCurrency ?? '';
}

function productListHtml(view: PageView): string {
  const groups = categoryTitles.map(([category, title]) => `<div class="menu-group" role="group" aria-label="${title}"><p class="menu-title">${title}</p>${
    view.snapshot.products.filter(product => product.category === category).map(product => `
      <button type="button" class="menu-item" role="option" aria-selected="${product.productId === view.state.productId}" data-action="choose-product" data-product="${product.productId}" data-focus="product-${product.productId}">
        <span class="menu-name" translate="no">${escapeHtml(product.productName)}</span><span class="menu-amount">${priceForVisitor(view, product.productId, product.configurations[0].configurationId)}</span></button>`).join('')}</div>`).join('');
  return `<div class="panel menu menu-of-products" role="dialog" aria-label="Choose a product" data-opened-by="open-product">${panelHeadHtml('Choose a product')}<div class="menu-columns">${groups}</div></div>`;
}

function configurationListHtml(view: PageView): string {
  const { product, configuration } = view.comparison;
  const choices = listsWholeConfigurations(product)
    ? `<div class="menu-list">${product.configurations.map(candidate => `
      <button type="button" class="menu-item" role="option" aria-selected="${candidate === configuration}" data-action="choose-configuration" data-configuration="${candidate.configurationId}" data-focus="configuration-${candidate.configurationId}">
        <span class="menu-name">${escapeHtml(specLine(product, candidate))}</span><span class="menu-amount">${priceForVisitor(view, product.productId, candidate.configurationId)}</span></button>`).join('')}</div>`
    : `<div class="menu-spec-choices">${specChoicesHtml(product, configuration, true)}<p class="menu-note" role="status">${escapeHtml(view.state.specChangeNote)}</p></div>`;
  return `<div class="panel menu menu-of-configurations" role="dialog" aria-label="Choose a configuration" data-opened-by="open-configuration">${panelHeadHtml(escapeHtml(product.productName))}${choices}</div>`;
}

// US dollars, the visitor's own money, then the most widely held currencies.
export function currencyCodesOffered({ snapshot, state }: PageView): string[] {
  const visitorCurrencyCode = state.visitorPlaceCode ? (countryToCurrency as Record<string, string>)[countryCodeOf(state.visitorPlaceCode)] : undefined;
  const hasExchangeRate = (code: string | undefined): code is string => !!code && snapshot.exchangeRates!.rates.some(rate => rate.currencyCode === code);
  return [...new Set(['USD', visitorCurrencyCode, ...widelyHeldCurrencyCodes].filter(hasExchangeRate))];
}

function currencyListHtml(view: PageView): string {
  return `<div class="panel menu menu-of-currencies" role="dialog" aria-label="Show prices in" data-opened-by="open-currency" data-aligned-to="end">${panelHeadHtml('Show prices in')}<div class="menu-list">${
    currencyCodesOffered(view).map(code => `
      <button type="button" class="menu-item" role="option" aria-selected="${code === view.state.displayCurrencyCode}" data-action="choose-currency" data-currency="${code}" data-focus="currency-${code}">
        <span class="menu-name">${escapeHtml(currencyWords(code))}</span><span class="menu-amount">${code}</span></button>`).join('')}</div></div>`;
}

// One list holds every country, state and province, so a search for "Ontario" finds it without choosing Canada first.
function placeListHtml(view: PageView, purpose: 'visitor-place' | 'compared-place', countryCodesOnMap: string[]): string {
  const { snapshot, state, comparison } = view;
  const isForVisitor = purpose === 'visitor-place', listedCountryCode = state.placeListCountryCode;
  const placePrice = (code: string) => placePriceOf(snapshot, comparison.product, comparison.prices, code);
  const canBeChosen = (code: string) => isForVisitor || canCompareWith(snapshot, comparison.product, comparison.prices, state.visitorPlaceCode, code);
  const countryCodes = [...new Set([...countryCodesOnMap, ...countriesTaxedByStateOrProvince, ...snapshot.appleStores.map(store => store.countryCode)])]
    .filter(code => countryName(code) !== code).sort((a, b) => placeName(snapshot, a).localeCompare(placeName(snapshot, b)));
  const row = (code: string): string => {
    const name = isStateOrProvince(code) ? `${placeName(snapshot, code)}, ${placeName(snapshot, countryCodeOf(code))}` : placeName(snapshot, code);
    const isChosen = code === (isForVisitor ? state.visitorPlaceCode : state.comparedPlaceCode);
    // With nothing typed the list is every country, or one country's states or provinces; typing searches everything.
    const isListedBeforeSearching = listedCountryCode ? countryCodeOf(code) === listedCountryCode && isStateOrProvince(code) : !isStateOrProvince(code);
    return `<button type="button" class="menu-item menu-place" role="option" aria-selected="${isChosen}" data-action="${isForVisitor ? 'choose-visitor-place' : 'compare-with'}" data-place="${code}"
      data-search-words="${escapeHtml(name.toLowerCase())}" data-listed-before-searching="${isListedBeforeSearching}" ${isListedBeforeSearching ? '' : 'hidden'} data-focus="place-${code}">
      ${flagHtml(code)}<span class="menu-name">${escapeHtml(name)}</span><span class="menu-amount">${priceWords(comparison, placePrice(code), { shortenMillions: true })?.inDisplayCurrency ?? ''}</span></button>`;
  };
  const rows = countryCodes.flatMap(countryCode => [countryCode, ...snapshot.salesTaxRegions.filter(region => countryCodeOf(region.regionCode) === countryCode).map(region => region.regionCode).sort((a, b) => placeName(snapshot, a).localeCompare(placeName(snapshot, b)))])
    .filter(canBeChosen).map(row).join('');
  const title = !isForVisitor ? 'Compare with' : listedCountryCode ? stateOrProvinceWords(listedCountryCode).chooseYours : 'Where are you?';
  const everyPlace = listedCountryCode ? `<button type="button" class="button button-quiet" data-action="list-every-place">Every country</button>` : '';
  const useMyLocation = isForVisitor ? `<button type="button" class="button button-quiet" data-action="use-my-location">${icons.locate}<span>Use my location</span></button>` : '';
  const openedBy = isForVisitor ? (listedCountryCode ? 'open-visitor-place-in-country' : 'open-visitor-place') : 'open-compared-place';
  return `<div class="panel menu menu-of-places" role="dialog" aria-label="${title}" data-opened-by="${openedBy}">${panelHeadHtml(title)}
    <div class="menu-search"><input type="search" name="place" autocomplete="off" spellcheck="false" placeholder="Search countries, states and provinces…" aria-label="Search countries, states and provinces" data-input="search-places">
      <div class="menu-search-actions">${useMyLocation}${everyPlace}</div>${state.locationProblem && isForVisitor ? `<p class="menu-note" role="status">${escapeHtml(state.locationProblem)}</p>` : ''}</div>
    <div class="menu-list" role="listbox" aria-label="${title}">${rows}</div><p class="menu-note menu-nothing-found" hidden>No place with that name.</p></div>`;
}

function rankedPlaceRowHtml({ comparison }: PageView, mark: PriceLineMark): string {
  const cheapestPriceInUsDollars = comparison.prices[0].takeHomePriceInUsDollars;
  return `<button type="button" class="menu-item menu-place" data-action="show-place" data-place="${mark.placeCode}" data-from="price-line" data-focus="ranked-${mark.placeCode}">${flagHtml(mark.placeCode)}
    <span class="menu-name">${escapeHtml(mark.placeName)}${mark.roleWords ? `<span class="menu-role">${escapeHtml(mark.roleWords)}</span>` : ''}</span>
    <span class="menu-amount"><span class="swatch" style="background:${priceColour((mark.lowestPriceInUsDollars + mark.highestPriceInUsDollars) / 2, cheapestPriceInUsDollars)}"></span>${priceWords(comparison, mark.placePrice, { shortenMillions: true })!.inDisplayCurrency}</span></button>`;
}

const marksCheapestFirst = (view: PageView) => priceLineMarks(view.comparison, placesShownOnPriceLine(view.state), view.roleWording)
  .sort((a, b) => a.lowestPriceInUsDollars - b.lowestPriceInUsDollars || a.placeName.localeCompare(b.placeName));

function allPricesHtml(view: PageView): string {
  const title = placesShownOnPriceLine(view.state) === 'countries' ? 'All prices, cheapest first' : 'US states and Canadian provinces, cheapest first';
  return `<div class="panel menu menu-of-places menu-of-all-prices" role="dialog" aria-label="${title}" data-opened-by="open-all-prices" data-aligned-to="end" data-opens="upwards">${panelHeadHtml(title)}<div class="menu-list">${marksCheapestFirst(view).map(mark => rankedPlaceRowHtml(view, mark)).join('')}</div></div>`;
}

// The places behind one count on the price line.
function placesAtOnePriceHtml(view: PageView): string {
  const places = marksCheapestFirst(view).filter(mark => view.state.placeCodesAtOnePrice.includes(mark.placeCode));
  const title = `${places.length} places at about the same price`;
  return `<div class="panel menu menu-of-places menu-of-all-prices" role="dialog" aria-label="${title}" data-opened-by="count-${view.state.placeCodesAtOnePrice[0]}" data-opens="upwards">${panelHeadHtml(title)}<p class="menu-title">${title}</p><div class="menu-list">${places.map(mark => rankedPlaceRowHtml(view, mark)).join('')}</div></div>`;
}

const dayWords = (unixSeconds: bigint) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Number(unixSeconds) * 1000));

function aboutPricesHtml({ snapshot }: PageView): string {
  const usRegion = snapshot.salesTaxRegions.find(region => region.regionCode.startsWith('US-'))!, canadianRegion = snapshot.salesTaxRegions.find(region => region.regionCode.startsWith('CA-'))!;
  const rates = snapshot.exchangeRates!;
  const source = (name: string, url: string) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`;
  return `<div class="panel menu menu-about-prices" role="dialog" aria-label="Prices include tax" data-opened-by="open-about-prices" data-opens="upwards">${panelHeadHtml('Prices include tax')}
    <div class="about-prices">
      <p>Every price is Apple’s own, from its online store in each place, and is what you pay to take the product home.</p>
      <p>In most countries Apple’s price already includes tax. In the United States Apple adds sales tax at checkout, which differs by city and county, so each state’s price uses its population-weighted average sales tax (${source(usRegion.sourceName, usRegion.sourceUrl)}, rates from ${escapeHtml(usRegion.ratesEffectiveDate)}). In Canada each province’s and territory’s price adds its sales taxes (${source(canadianRegion.sourceName, canadianRegion.sourceUrl)}).</p>
      <p>Apple’s prices were read on ${dayWords(snapshot.fetchedAtUnixSeconds)}. Other currencies use exchange rates from ${source(rates.sourceName, rates.sourceUrl)}, ${dayWords(rates.publishedAtUnixSeconds)}.</p>
    </div></div>`;
}

export function placePopUpHtml({ snapshot, state, comparison, openerPlaceCode, visitorInComparisons }: PageView, placeCode: string): string {
  const price = placePriceOf(snapshot, comparison.product, comparison.prices, placeCode), name = placeName(snapshot, placeCode), words = priceWords(comparison, price);
  const isVisitorPlace = placeCode === state.visitorPlaceCode, isComparedPlace = placeCode === state.comparedPlaceCode;
  const inLocalMoney = words?.inLocalCurrency ? ` <span class="pop-up-price-in-local-money">(${words.inLocalCurrency})</span>` : '';
  let body: string;
  if (price.kind === 'priced') {
    const method = salesTaxSentence(snapshot, price.price), difference = differenceFromVisitorWords(comparison, price.price, visitorInComparisons);
    body = `<p class="pop-up-price"><span class="amount">${words!.inDisplayCurrency}</span>${inLocalMoney}</p>
      ${difference ? `<p class="pop-up-line">${difference}</p>` : ''}${isVisitorPlace ? `<p class="pop-up-line">${openerPlaceCode ? 'This is the place the link shows.' : 'This is where you are.'}</p>` : ''}${method ? `<p class="pop-up-line">${escapeHtml(method)}</p>` : ''}`;
  } else if (price.kind === 'priced-by-state-or-province') {
    body = `<p class="pop-up-price pop-up-price-range">${words!.inDisplayCurrency}${inLocalMoney}</p>
      <p class="pop-up-line">It depends on the ${stateOrProvinceWords(placeCode).one}.${placeCode === 'US' ? ' Sales tax is the population-weighted average for each state.' : ''}</p>`;
  } else {
    body = `<p class="pop-up-line pop-up-no-price">${escapeHtml(unpricedSentence(comparison, price, placeCode))}</p>`;
  }
  const canCompare = canCompareWith(snapshot, comparison.product, comparison.prices, state.visitorPlaceCode, placeCode);
  const actions = [
    canCompare && !isComparedPlace ? `<button type="button" class="button button-primary" data-action="compare-with" data-place="${placeCode}">Compare with ${state.visitorPlaceCode ? visitorInComparisons : 'this place'}</button>` : '',
    isComparedPlace ? '<button type="button" class="button" data-action="compare-with" data-place="">Stop comparing</button>' : '',
    price.kind === 'priced-by-state-or-province' ? `<button type="button" class="button" data-action="show-map-area" data-area="${placeCode === 'US' ? 'united-states' : 'canada'}">Show the ${placeCode === 'US' ? 'states' : 'provinces'}</button>` : '',
    !isVisitorPlace ? `<button type="button" class="button button-quiet" data-action="choose-visitor-place" data-place="${placeCode}">I’m here</button>` : '',
  ].join('');
  const seeAtApple = price.kind === 'priced' ? `<a class="pop-up-link" href="${escapeHtml(price.price.applePageUrl)}" target="_blank" rel="noopener">See it at Apple</a>` : '';
  return `<div class="panel pop-up" role="dialog" aria-label="${escapeHtml(name)}">
    <button type="button" class="icon-button pop-up-close" data-action="close-pop-up" aria-label="Close">${icons.close}</button>
    <div class="pop-up-head">${flagHtml(placeCode, 'flag-in-pop-up')}<h2 class="pop-up-name">${escapeHtml(name)}</h2></div>
    ${body}<div class="pop-up-actions">${actions}</div>${seeAtApple}
  </div>`;
}

export const shareLink = ({ state }: PageView) => `${location.origin}${shareLinkPath(state)}`;
export const shareTextSuggested = ({ comparison }: PageView) => shareSentence(comparison);

// X shows the link's picture beside the post. The words are the visitor's own, exactly as typed; none at all is allowed.
export function postOnXLink(view: PageView, text: string): string {
  const parameters = new URLSearchParams({ url: shareLink(view) });
  if (text) parameters.set('text', text);
  return `https://x.com/intent/post?${parameters}`;
}

function shareDialogHtml(view: PageView): string {
  const text = view.state.shareTextAsTyped ?? shareTextSuggested(view), cardPath = shareCardPath(view.state);
  return `<div class="panel dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
    <div class="dialog-head"><h2 id="share-title" class="dialog-title">Share these prices</h2><button type="button" class="icon-button" data-action="close-panel" aria-label="Close">${icons.close}</button></div>
    <div class="dialog-body">
      <img class="share-card" src="${escapeHtml(cardPath)}" width="1600" height="900" alt="The picture that goes with your post: ${escapeHtml(shareTextSuggested(view))}">
      <div class="share-side">
        <label class="field-label" for="share-text">Your post</label>
        <textarea id="share-text" name="post" rows="5" autocomplete="off" data-input="share-text">${escapeHtml(text)}</textarea>
        <p class="share-link" translate="no">${escapeHtml(shareLink(view).replace(/^https?:\/\//, ''))}</p>
        <div class="share-actions">
          <a class="button button-primary" id="post-on-x" href="${escapeHtml(postOnXLink(view, text))}" target="_blank" rel="noopener">Post on X</a>
          <button type="button" class="button" data-action="copy-share-link">Copy link</button>
          <a class="button" href="${escapeHtml(cardPath)}" download="apple-prices-${view.state.productId}.png">Save picture</a>
        </div>
        <p class="share-status" role="status"></p>
      </div>
    </div></div>`;
}

export function openPanelHtml(view: PageView, countryCodesOnMap: string[]): string {
  switch (view.state.openPanel) {
    case 'product': return productListHtml(view);
    case 'configuration': return configurationListHtml(view);
    case 'currency': return currencyListHtml(view);
    case 'visitor-place': case 'compared-place': return placeListHtml(view, view.state.openPanel, countryCodesOnMap);
    case 'all-prices': return allPricesHtml(view);
    case 'places-at-one-price': return placesAtOnePriceHtml(view);
    case 'about-prices': return aboutPricesHtml(view);
    case 'share': return shareDialogHtml(view);
    default: return '';
  }
}
