// A share link carries everything the share card shows: /iphone-18-pro/6.3in-256gb?me=NL&vs=CN&in=EUR
import type { PriceSnapshot } from './generated/apple_prices/v1/price_snapshot_pb.js';
import { isKnownPlaceCode, placeCodeForCountryCode } from './places.ts';
import { canCompareWith, type Selection } from './price-comparison.ts';
import { takeHomePrices } from './take-home-prices.ts';

export const displayCurrencyCodeUnlessChosen = 'USD';

function query(selection: Selection): string {
  const parameters = new URLSearchParams();
  if (selection.visitorPlaceCode) parameters.set('me', selection.visitorPlaceCode);
  if (selection.comparedPlaceCode) parameters.set('vs', selection.comparedPlaceCode);
  if (selection.displayCurrencyCode !== displayCurrencyCodeUnlessChosen) parameters.set('in', selection.displayCurrencyCode);
  return parameters.size ? `?${parameters}` : '';
}

export function shareLinkPath(selection: Selection): string {
  return `/${selection.productId}/${selection.configurationId}${query(selection)}`;
}

export function shareCardPath(selection: Selection): string {
  return `/share-card/${selection.productId}/${selection.configurationId}.png${query(selection)}`;
}

// Reads a share link, or a share card's address. Anything the snapshot does not know falls back to the first product, its base model, no place and US dollars.
export function selectionFromShareLink(snapshot: PriceSnapshot, link: URL): Selection {
  const [productId, configurationId] = link.pathname.replace(/^\/share-card/, '').replace(/\.png$/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const product = snapshot.products.find(candidate => candidate.productId === productId) ?? snapshot.products[0];
  const configuration = product.configurations.find(candidate => candidate.configurationId === configurationId) ?? product.configurations[0];
  const placeCodeIn = (parameter: string) => {
    const placeCode = placeCodeForCountryCode((link.searchParams.get(parameter) ?? '').toUpperCase());
    return isKnownPlaceCode(snapshot, placeCode) ? placeCode : null;
  };
  const visitorPlaceCode = placeCodeIn('me'), comparedPlaceCode = placeCodeIn('vs');
  const displayCurrencyCode = (link.searchParams.get('in') ?? '').toUpperCase();
  const prices = takeHomePrices(snapshot, product.productId, configuration.configurationId);
  return {
    productId: product.productId,
    configurationId: configuration.configurationId,
    visitorPlaceCode,
    comparedPlaceCode: comparedPlaceCode && canCompareWith(snapshot, product, prices, visitorPlaceCode, comparedPlaceCode) ? comparedPlaceCode : null,
    displayCurrencyCode: snapshot.exchangeRates!.rates.some(rate => rate.currencyCode === displayCurrencyCode) ? displayCurrencyCode : displayCurrencyCodeUnlessChosen,
  };
}

export function isShareLinkPath(snapshot: PriceSnapshot, pathname: string): boolean {
  const [productId, configurationId, ...rest] = pathname.split('/').filter(Boolean);
  const product = snapshot.products.find(candidate => candidate.productId === productId);
  return !rest.length && !!product?.configurations.some(candidate => candidate.configurationId === configurationId);
}
