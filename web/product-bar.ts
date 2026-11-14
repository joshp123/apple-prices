// The bar across the top: which product and configuration, which currency, and Share.
import type { Product, ProductConfiguration } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { productPhotoFor } from '../src/product-photos.ts';
import { specLine, specNamesThatVary, specTitle, specValueWords, type SpecName } from '../src/spec-words.ts';
import { escapeHtml, icons, productPhotoHtml } from './html.ts';
import type { PageView } from './page-view.ts';

// A Mac's configurations differ in several specs at once, so they are listed whole; other products get one row of choices for each spec.
export const listsWholeConfigurations = (product: Product) => product.configurations.some(configuration => configuration.specs!.memoryGigabytes !== undefined);

export function currencyWords(currencyCode: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currencyCode, currencyDisplay: 'name', maximumFractionDigits: 0 }).format(2).replace(/^[\d.,]+\s*/, '');
}

export function specChoicesHtml(product: Product, configuration: ProductConfiguration, withTitles: boolean): string {
  return specNamesThatVary(product).map(specName => {
    const values = [...new Set(product.configurations.map(candidate => candidate.specs![specName] as string | number))];
    const choices = values.map(value => {
      const isChosen = configuration.specs![specName] === value;
      return `<button type="button" role="radio" aria-checked="${isChosen}" tabindex="${isChosen ? 0 : -1}" class="segment" data-action="choose-spec" data-spec="${specName}" data-value="${escapeHtml(String(value))}" data-focus="spec-${specName}-${escapeHtml(String(value))}">${escapeHtml(specValueWords(specName, value))}</button>`;
    }).join('');
    return `${withTitles ? `<p class="menu-title">${specTitle(specName)}</p>` : ''}<div class="segments" role="radiogroup" aria-label="${specTitle(specName)}">${choices}</div>`;
  }).join('');
}

// The configuration with the chosen value that changes the fewest other specs.
export function closestConfigurationWith(product: Product, current: ProductConfiguration, specName: SpecName, value: string): ProductConfiguration {
  const otherSpecsChanged = (candidate: ProductConfiguration) => specNamesThatVary(product).filter(name => name !== specName && candidate.specs![name] !== current.specs![name]);
  return product.configurations.filter(candidate => String(candidate.specs![specName]) === value)
    .reduce((closest, candidate) => (otherSpecsChanged(candidate).length < otherSpecsChanged(closest).length ? candidate : closest));
}

export function specChangeNote(product: Product, before: ProductConfiguration, after: ProductConfiguration, chosenSpecName: SpecName): string {
  return specNamesThatVary(product).filter(name => name !== chosenSpecName && after.specs![name] !== before.specs![name])
    .map(name => `${specTitle(name)} changed to ${specValueWords(name, after.specs![name] as string | number)}.`).join(' ');
}

export function productBarHtml({ state, comparison }: PageView): string {
  const { product, configuration } = comparison;
  const specs = specLine(product, configuration), currencyCode = state.displayCurrencyCode;
  const choicesInBar = listsWholeConfigurations(product) ? '' : `<div class="bar-spec-choices">${specChoicesHtml(product, configuration, false)}</div>`;
  const configurationPicker = product.configurations.length > 1
    ? `<button type="button" class="picker picker-configuration" data-action="open-panel" data-panel="configuration" data-focus="open-configuration" aria-haspopup="dialog" aria-expanded="${state.openPanel === 'configuration'}" aria-label="Configuration: ${escapeHtml(specs)}"><span class="picker-words">${escapeHtml(specs)}</span>${icons.chevronDown}</button>`
    : `<span class="bar-specs">${escapeHtml(specs)}</span>`;
  return `
    <div class="bar-product">
      ${productPhotoHtml(productPhotoFor(product.productId, configuration.configurationId), 44)}
      <button type="button" class="picker picker-product" data-action="open-panel" data-panel="product" data-focus="open-product" aria-haspopup="dialog" aria-expanded="${state.openPanel === 'product'}">
        <span class="picker-words" translate="no">${escapeHtml(product.productName)}</span>${icons.chevronDown}</button>
    </div>
    <div class="bar-configuration" data-spec-choice-rows="${choicesInBar ? specNamesThatVary(product).length : 'none'}">
      ${choicesInBar}${configurationPicker}<span class="bar-note" role="status">${escapeHtml(state.specChangeNote)}</span>
    </div>
    <div class="bar-actions">
      <button type="button" class="picker picker-currency" data-action="open-panel" data-panel="currency" data-focus="open-currency" aria-haspopup="dialog" aria-expanded="${state.openPanel === 'currency'}" aria-label="Prices in ${escapeHtml(currencyWords(currencyCode))}">
        <span class="picker-lead">Prices in</span> <span class="picker-words">${escapeHtml(currencyWords(currencyCode))}</span><span class="picker-code">${currencyCode}</span>${icons.chevronDown}</button>
      <button type="button" class="button button-primary" data-action="open-panel" data-panel="share" data-focus="open-share">${icons.share}<span>Share</span></button>
    </div>`;
}
