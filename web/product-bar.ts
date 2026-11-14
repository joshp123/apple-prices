// The bar across the top: which product and configuration, which currency, and Share. The controls are built once and updated in place,
// so an open list closes and hands focus back the way the kit does it.
import '@ui-sdk/web/dialog';
import '@ui-sdk/web/select';
import type { UiSelectElement } from '@ui-sdk/web';
import countryToCurrency from 'country-to-currency';
import { ProductCategory, type ProductConfiguration } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { widelyHeldCurrencyCodes } from '../src/money.ts';
import { countryCodeOf } from '../src/places.ts';
import { priceComparison, priceWords } from '../src/price-comparison.ts';
import { productPhotoFor } from '../src/product-photos.ts';
import { specLine } from '../src/spec-words.ts';
import { escapeHtml, icons, productPhotoHtml } from './html.ts';
import type { PageView } from './page-view.ts';

export function currencyWords(currencyCode: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currencyCode, currencyDisplay: 'name', maximumFractionDigits: 0 }).format(2).replace(/^[\d.,]+\s*/, '');
}

const categoryTitles: [ProductCategory, string][] = [
  [ProductCategory.IPHONE, 'iPhone'], [ProductCategory.IPAD, 'iPad'], [ProductCategory.MAC, 'Mac'], [ProductCategory.DISPLAY, 'Displays'], [ProductCategory.WATCH, 'Watch'],
  [ProductCategory.VISION, 'Vision'], [ProductCategory.AIRPODS, 'AirPods'], [ProductCategory.HOME, 'TV and Home'], [ProductCategory.ACCESSORY, 'Accessories'],
];

const selectHtml = (id: string, label: string, buttonClass: string) => `<ui-select id="${id}" presentation="auto">
    <ui-select-label class="visually-hidden">${label}</ui-select-label>
    <ui-select-trigger><button type="button" class="control ${buttonClass}"><ui-select-value></ui-select-value></button></ui-select-trigger>
    <ui-select-content hidden class="list" side-offset="6" align="start"></ui-select-content>
  </ui-select>`;

export const productBarHtml = `
  <div class="bar-photo" aria-hidden="true"></div>
  <div class="bar-cell bar-product">${selectHtml('product-select', 'Product', 'control-product')}</div>
  <div class="bar-cell bar-configuration">${selectHtml('configuration-select', 'Configuration', 'control-configuration')}<p class="bar-specs"></p></div>
  <div class="bar-cell bar-currency">${selectHtml('currency-select', 'Prices in', 'control-currency')}</div>
  <div class="bar-cell bar-share"><ui-dialog-trigger for="share-dialog"><button type="button" class="control control-primary">${icons.share}<span>Share</span></button></ui-dialog-trigger></div>`;

// The label shows in the closed control; the words and the amount show in the list.
const itemHtml = (value: string, label: string, amount: string, words = label) => `<ui-select-item value="${escapeHtml(value)}" label="${escapeHtml(label)}">
    <span class="item-words">${escapeHtml(words)}</span><span class="item-amount">${amount}</span><ui-select-item-indicator></ui-select-item-indicator></ui-select-item>`;

// What another product or configuration costs the visitor, to help them choose.
function priceForVisitor({ snapshot, state }: PageView, productId: string, configurationId: string): string {
  if (!state.visitorPlaceCode) return '';
  const other = priceComparison(snapshot, { ...state, productId, configurationId, comparedPlaceCode: null });
  const visitor = other.columns.find(column => column.role === 'visitor')!;
  return priceWords(other, visitor.placePrice, { shortenMillions: true })?.inDisplayCurrency ?? '';
}

// US dollars, the visitor's own money, then the most widely held currencies.
export function currencyCodesOffered({ snapshot, state }: PageView): string[] {
  const visitorCurrencyCode = state.visitorPlaceCode ? (countryToCurrency as Record<string, string>)[countryCodeOf(state.visitorPlaceCode)] : undefined;
  const hasExchangeRate = (code: string | undefined): code is string => !!code && snapshot.exchangeRates!.rates.some(rate => rate.currencyCode === code);
  return [...new Set(['USD', visitorCurrencyCode, ...widelyHeldCurrencyCodes].filter(hasExchangeRate))];
}

// Replaces a list's items only when they differ, then shows the chosen one. Setting the value fires no change event.
const itemsShown = new WeakMap<Element, string>();
function fillSelect(select: UiSelectElement, itemsHtml: string, value: string): void {
  const content = select.querySelector('ui-select-content')!;
  if (itemsShown.get(content) !== itemsHtml) {
    content.innerHTML = itemsHtml;
    itemsShown.set(content, itemsHtml);
  }
  if (select.value !== value) select.value = value;
}

// Configurations listed by size, then memory, then storage, and otherwise in Apple's own order, so the list reads like Apple's shop.
const sortingSpecs = ['screenSizeInches', 'caseSizeMillimetres', 'memoryGigabytes', 'storageGigabytes'] as const;
function inShopOrder(configurations: ProductConfiguration[]): ProductConfiguration[] {
  const difference = (a: ProductConfiguration, b: ProductConfiguration) => sortingSpecs.map(name => Number(a.specs![name] ?? 0) - Number(b.specs![name] ?? 0)).find(each => each !== 0) ?? 0;
  return configurations.map((configuration, index) => ({ configuration, index }))
    .sort((a, b) => difference(a.configuration, b.configuration) || a.index - b.index).map(({ configuration }) => configuration);
}

export function drawProductBar(bar: HTMLElement, view: PageView): void {
  const { snapshot, state, comparison: { product, configuration } } = view;
  bar.querySelector('.bar-photo')!.innerHTML = productPhotoHtml(productPhotoFor(product.productId, configuration.configurationId), 40);

  const products = categoryTitles.map(([category, title]) => {
    const items = snapshot.products.filter(candidate => candidate.category === category)
      .map(candidate => itemHtml(candidate.productId, candidate.productName, priceForVisitor(view, candidate.productId, candidate.configurations[0].configurationId))).join('');
    return items && `<ui-select-group><ui-select-group-label>${title}</ui-select-group-label>${items}</ui-select-group>`;
  }).join('');
  fillSelect(bar.querySelector<UiSelectElement>('#product-select')!, products, product.productId);

  // A product with one configuration has nothing to choose: its specs are words, not a control.
  const hasChoice = product.configurations.length > 1;
  bar.querySelector<HTMLElement>('#configuration-select')!.hidden = !hasChoice;
  bar.querySelector('.bar-specs')!.textContent = hasChoice ? '' : specLine(product, configuration);
  if (hasChoice) {
    const configurations = inShopOrder(product.configurations).map(candidate => itemHtml(candidate.configurationId, specLine(product, candidate), priceForVisitor(view, product.productId, candidate.configurationId))).join('');
    fillSelect(bar.querySelector<UiSelectElement>('#configuration-select')!, configurations, configuration.configurationId);
  }

  const sentenceCase = (words: string) => words[0].toUpperCase() + words.slice(1);
  const currencies = currencyCodesOffered(view).map(code => itemHtml(code, code, code, sentenceCase(currencyWords(code)))).join('');
  fillSelect(bar.querySelector<UiSelectElement>('#currency-select')!, currencies, state.displayCurrencyCode);
}
