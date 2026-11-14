// The page: reads the address, loads the snapshot and the map, draws every part, and redraws when the visitor chooses something.
import { fromBinary } from '@bufbuild/protobuf';
import { PriceSnapshotSchema, type PriceSnapshot } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { countryCodeOf, isKnownPlaceCode, placeCodeForCountryCode, placeNameAfterIn } from '../src/places.ts';
import { canCompareWith, priceComparison, type PriceComparison } from '../src/price-comparison.ts';
import { selectionFromShareLink, shareLinkPath } from '../src/share-link.ts';
import { specLine, type SpecName } from '../src/spec-words.ts';
import { answerHtml } from './answer.ts';
import { isPhoneWidth, roleWordingOnPage, type OpenPanel, type PageState, type PageView } from './page-view.ts';
import { openPanelHtml, placePopUpHtml, postOnXLink, shareLink } from './panels.ts';
import { createPriceMap, mapAreas, type PriceMap } from './price-map.ts';
import { closestConfigurationWith, currencyWords, productBarHtml, specChangeNote } from './product-bar.ts';

// Filled in by hosting/build.mjs: addresses that change when the file does.
declare const PRICE_SNAPSHOT_PATH: string;
declare const MAP_PLACES_PATH: string;

const element = <E extends HTMLElement>(selector: string) => document.querySelector<E>(selector)!;
const bar = element('#bar'), answer = element('#answer'), mapBox = element('#map'), panelsBox = element('#panels');

let snapshot: PriceSnapshot, state: PageState, comparison: PriceComparison, priceMap: PriceMap;
// The place /api/whereami gives for whoever opened the page.
let openerPlaceCode: string | null = null;
const visitorChosePlaceInThisTab = 'visitor chose their place in this tab';

function view(): PageView {
  const shownPlace = state.visitorPlaceCode;
  const isSomeoneElsesPlace = !!openerPlaceCode && !!shownPlace && countryCodeOf(shownPlace) !== openerPlaceCode && !sessionStorage.getItem(visitorChosePlaceInThisTab);
  return {
    snapshot, state, comparison,
    openerPlaceCode: isSomeoneElsesPlace ? openerPlaceCode : null,
    roleWording: isSomeoneElsesPlace ? { ...roleWordingOnPage, visitor: 'Shared place' } : roleWordingOnPage,
    visitorInComparisons: isSomeoneElsesPlace ? placeNameAfterIn(snapshot, shownPlace) : 'you',
  };
}

// ---------- the address ----------

const openPanels: OpenPanel[] = ['product', 'configuration', 'currency', 'visitor-place', 'compared-place', 'about-prices', 'share'];

function stateFromAddress(): PageState {
  const address = new URL(location.href), parameter = (name: string) => address.searchParams.get(name);
  const placeOrNothing = (code: string | null) => (code && isKnownPlaceCode(snapshot, code) ? code : null);
  return {
    ...selectionFromShareLink(snapshot, address),
    mapArea: mapAreas[parameter('area') ?? ''] ? parameter('area')! : 'world',
    popUpPlaceCode: placeOrNothing(parameter('place')),
    openPanel: openPanels.find(panel => panel === parameter('panel')) ?? null,
    placeListCountryCode: placeOrNothing(parameter('list')),
    specChangeNote: '',
    shareTextAsTyped: null,
    locationProblem: '',
  };
}

function addressOfState(): string {
  const address = new URL(shareLinkPath(state), location.origin);
  const set = (name: string, value: string | null, unlessValue: string | null = null) => { if (value && value !== unlessValue) address.searchParams.set(name, value); };
  if (mapAreas[state.mapArea]) set('area', state.mapArea, 'world');
  set('place', state.popUpPlaceCode);
  set('panel', state.openPanel);
  set('list', state.placeListCountryCode);
  return address.pathname + address.search;
}

const chosenPrices = () => [state.productId, state.configurationId, state.visitorPlaceCode, state.comparedPlaceCode, state.displayCurrencyCode].join(' ');

function announce(message: string): void {
  element('#announcer').textContent = message;
}

// ---------- drawing ----------

function setTitle(): void {
  document.title = `${comparison.product.productName}: what it costs in each country`;
}

// The answer never scrolls inside itself: when its rows would not all show, it is drawn tighter, and tighter again.
function drawAnswer(): void {
  answer.innerHTML = answerHtml(view());
  answer.classList.remove('is-tighter', 'is-tightest');
  for (const tightness of ['is-tighter', 'is-tightest']) if (!isPhoneWidth() && answer.scrollHeight > answer.clientHeight) answer.classList.add(tightness);
}

function drawPanels(): void {
  const panel = openPanelHtml(view(), [...priceMap.placeCodesOnMap].filter(code => /^[A-Z]{2}$/.test(code)));
  const scrim = state.openPanel ? `<div class="scrim ${state.openPanel === 'share' ? '' : 'scrim-clear'}" data-action="close-panel"></div>` : '';
  panelsBox.innerHTML = scrim + panel + (state.popUpPlaceCode ? placePopUpHtml(view(), state.popUpPlaceCode) : '');
  placeOpenMenu();
  placePopUp();
}

// A menu opens from the control that opened it.
function placeOpenMenu(): void {
  const menu = panelsBox.querySelector<HTMLElement>('.menu');
  if (!menu || isPhoneWidth()) return;
  const opener = (document.querySelector<HTMLElement>(`[data-focus="${menu.dataset.openedBy}"]`) ?? bar).getBoundingClientRect();
  const left = Math.max(12, Math.min(innerWidth - menu.offsetWidth - 12, menu.dataset.alignedTo === 'end' ? opener.right - menu.offsetWidth : opener.left));
  const top = menu.dataset.opens === 'upwards' ? opener.top - menu.offsetHeight - 8 : Math.min(opener.bottom + 8, innerHeight - menu.offsetHeight - 12);
  menu.style.transform = `translate(${Math.round(left)}px,${Math.round(Math.max(12, top))}px)`;
  menu.style.transformOrigin = `${opener.left + opener.width / 2 - left}px ${menu.dataset.opens === 'upwards' ? '100%' : '0'}`;
}

function placePopUp(): void {
  const popUp = panelsBox.querySelector<HTMLElement>('.pop-up');
  if (!popUp || !state.popUpPlaceCode || isPhoneWidth()) return;
  let { x, y } = priceMap.pointOnPage(state.popUpPlaceCode);
  const standsAbove = y - mapBox.getBoundingClientRect().top > popUp.offsetHeight + 80;
  y += standsAbove ? -18 : 18;
  const left = Math.max(12, Math.min(innerWidth - popUp.offsetWidth - 12, x - popUp.offsetWidth / 2));
  const top = Math.max(76, Math.min(innerHeight - popUp.offsetHeight - 12, standsAbove ? y - popUp.offsetHeight : y));
  popUp.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
  popUp.style.transformOrigin = `${x - left}px ${standsAbove ? '100%' : '0'}`;
}

function drawEverything(): void {
  comparison = priceComparison(snapshot, state);
  bar.innerHTML = productBarHtml(view());
  drawAnswer();
  priceMap.fitToContainer();
  priceMap.colourPlaces(view());
  priceMap.buildLabels(view());
  drawPanels();
  setTitle();
}

// ---------- changing ----------

type ChangeOptions = { focusAfterwards?: string };

function change(changes: Partial<PageState>, options: ChangeOptions = {}): void {
  const focusedBefore = (document.activeElement as HTMLElement | null)?.dataset?.focus, before = { ...state }, pricesBefore = chosenPrices();
  Object.assign(state, changes);
  if (state.comparedPlaceCode === state.visitorPlaceCode) state.comparedPlaceCode = null;
  const product = snapshot.products.find(candidate => candidate.productId === state.productId)!;
  if (!product.configurations.some(candidate => candidate.configurationId === state.configurationId)) state.configurationId = product.configurations[0].configurationId;
  const pricesChanged = chosenPrices() !== pricesBefore;
  if (pricesChanged) {
    comparison = priceComparison(snapshot, state);
    // A compared place keeps its place only while the product has a price there.
    if (state.comparedPlaceCode && !canCompareWith(snapshot, comparison.product, comparison.prices, state.visitorPlaceCode, state.comparedPlaceCode)) {
      state.comparedPlaceCode = null;
      comparison = priceComparison(snapshot, state);
    }
    state.shareTextAsTyped = null;
  }
  if (pricesChanged || before.openPanel !== state.openPanel || before.specChangeNote !== state.specChangeNote || before.locationProblem !== state.locationProblem) {
    bar.innerHTML = productBarHtml(view());
    drawAnswer();
  }
  if (pricesChanged || before.popUpPlaceCode !== state.popUpPlaceCode) priceMap.colourPlaces(view());
  if (pricesChanged) priceMap.buildLabels(view());
  if (before.mapArea !== state.mapArea) {
    priceMap.showArea(state.mapArea, true);
  }
  drawPanels();
  setTitle();
  // A new choice of prices is a step Back can undo; opening a list or moving the map is not.
  if (pricesChanged) history.pushState(null, '', addressOfState()); else history.replaceState(null, '', addressOfState());

  const justOpened = before.openPanel !== state.openPanel && state.openPanel;
  const focusKey = options.focusAfterwards ?? (before.openPanel && !state.openPanel ? panelOpener(before) : focusedBefore);
  if (justOpened) whatToFocusInOpenPanel()?.focus({ preventScroll: true });
  else if (before.popUpPlaceCode !== state.popUpPlaceCode && state.popUpPlaceCode) panelsBox.querySelector<HTMLElement>('.pop-up .button, .pop-up-close')?.focus({ preventScroll: true });
  else if (focusKey) document.querySelector<HTMLElement>(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
}

// Where typing belongs first, else the current choice, else the first thing that can be chosen.
function whatToFocusInOpenPanel(): HTMLElement | undefined {
  for (const selector of ['textarea, input', '[aria-selected="true"], [aria-checked="true"]', '.menu-item, a[href], button']) {
    const visible = [...panelsBox.querySelectorAll<HTMLElement>(`.panel ${selector}`)].find(candidate => candidate.offsetParent);
    if (visible) return visible;
  }
}

const panelOpener = (stateWhenOpen: PageState) =>
  (stateWhenOpen.openPanel === 'visitor-place' && stateWhenOpen.placeListCountryCode && document.querySelector('[data-focus="open-visitor-place-in-country"]') ? 'open-visitor-place-in-country' : `open-${stateWhenOpen.openPanel}`);

// ---------- where the visitor is ----------

function chooseVisitorPlace(placeCode: string): void {
  sessionStorage.setItem(visitorChosePlaceInThisTab, 'yes');
  change({ visitorPlaceCode: placeCode, openPanel: null, placeListCountryCode: null, popUpPlaceCode: null, locationProblem: '' }, { focusAfterwards: 'open-visitor-place' });
  announce(`You are in ${placeNameAfterIn(snapshot, placeCode)}`);
}

// The country the opener's connection comes from. It is where they are only when the address names no place: a shared link
// opens exactly as shared, and its place is then called by name with one way to the opener's own price.
async function findOpenerCountry(): Promise<void> {
  const response = await fetch('/api/whereami');
  if (!response.ok) return;
  const { country } = await response.json() as { country: string | null };
  const placeCode = country && placeCodeForCountryCode(country);
  if (!placeCode || !isKnownPlaceCode(snapshot, placeCode)) return;
  openerPlaceCode = placeCode;
  if (!state.visitorPlaceCode) {
    state.visitorPlaceCode = placeCode;
    history.replaceState(null, '', addressOfState());
  }
  drawEverything();
}

// The opener's own price, beside the shared place's unless the link already compares with somewhere.
function seePriceWhereOpened(): void {
  const sharedPlaceCode = state.visitorPlaceCode;
  sessionStorage.setItem(visitorChosePlaceInThisTab, 'yes');
  change({ visitorPlaceCode: openerPlaceCode, comparedPlaceCode: state.comparedPlaceCode ?? sharedPlaceCode }, { focusAfterwards: 'open-visitor-place' });
  announce(`You are in ${placeNameAfterIn(snapshot, openerPlaceCode!)}`);
}

// The visitor's state or province, from the browser's own idea of where they are. Only the place's code is kept; the position goes nowhere.
function useMyLocation(): void {
  if (!navigator.geolocation) return change({ locationProblem: 'This browser cannot share a location. Choose your place from the list.' });
  navigator.geolocation.getCurrentPosition(position => {
    const mapPlaceCode = priceMap.placeCodeAt(position.coords.longitude, position.coords.latitude);
    const placeCode = mapPlaceCode && placeCodeForCountryCode(mapPlaceCode);
    if (placeCode && isKnownPlaceCode(snapshot, placeCode)) chooseVisitorPlace(placeCode);
    else change({ locationProblem: 'We could not tell which place that location is in. Choose your place from the list.' });
  }, problem => {
    change({ locationProblem: problem.code === problem.PERMISSION_DENIED ? 'Your browser did not share your location. Choose your place from the list.' : 'Your location could not be found. Choose your place from the list.' });
  }, { enableHighAccuracy: false, maximumAge: 600_000, timeout: 10_000 });
}

// ---------- what the visitor does ----------

document.addEventListener('click', event => {
  const clicked = (event.target as Element).closest<HTMLElement>('[data-action]');
  if (!clicked) return;
  const data = clicked.dataset;
  if (data.action === 'load-again') return location.reload();
  if (!state) return;
  switch (data.action) {
    case 'open-panel': {
      const isOpen = state.openPanel === data.panel && (state.placeListCountryCode ?? '') === (data.placeListCountry ?? '');
      return change({ openPanel: isOpen ? null : data.panel as OpenPanel, placeListCountryCode: data.placeListCountry ?? null, popUpPlaceCode: null });
    }
    case 'close-panel': return change({ openPanel: null, placeListCountryCode: null });
    case 'close-pop-up': return change({ popUpPlaceCode: null });
    case 'choose-product':
      change({ productId: data.product!, configurationId: '', openPanel: null, specChangeNote: '' }, { focusAfterwards: 'open-product' });
      return announce(comparison.product.productName);
    case 'choose-configuration':
      change({ configurationId: data.configuration!, openPanel: null, specChangeNote: '' }, { focusAfterwards: 'open-configuration' });
      return announce(specLine(comparison.product, comparison.configuration));
    case 'choose-spec': {
      const before = comparison.configuration, after = closestConfigurationWith(comparison.product, before, data.spec as SpecName, data.value!);
      change({ configurationId: after.configurationId, specChangeNote: specChangeNote(comparison.product, before, after, data.spec as SpecName) });
      return announce(`${specLine(comparison.product, comparison.configuration)}. ${state.specChangeNote}`);
    }
    case 'choose-currency':
      change({ displayCurrencyCode: data.currency!, openPanel: null }, { focusAfterwards: 'open-currency' });
      return announce(`Prices in ${currencyWords(state.displayCurrencyCode)}`);
    case 'choose-visitor-place': return chooseVisitorPlace(data.place!);
    case 'list-every-place': return change({ placeListCountryCode: null });
    case 'use-my-location': return useMyLocation();
    case 'see-price-where-opened': return seePriceWhereOpened();
    case 'compare-with':
      change({ comparedPlaceCode: data.place || null, openPanel: null, placeListCountryCode: null, popUpPlaceCode: null }, { focusAfterwards: data.place ? 'row-compared' : 'open-compared-place' });
      return announce(state.comparedPlaceCode ? `Comparing with ${placeNameAfterIn(snapshot, state.comparedPlaceCode)}` : 'No longer comparing');
    case 'show-place': return change({ popUpPlaceCode: data.place!, openPanel: null });
    case 'show-map-area': return change({ mapArea: data.area!, popUpPlaceCode: null });
    case 'zoom-map':
      priceMap.zoomBy(Number(data.by));
      return mapMovedByHand();
    case 'copy-share-link':
      return void navigator.clipboard.writeText(shareLink(view())).then(
        () => { element('.share-status').textContent = 'Link copied.'; },
        () => { element('.share-status').textContent = 'This browser did not allow copying. Select the link above instead.'; });
  }
});

function mapMovedByHand(): void {
  if (state.mapArea === 'moved-by-hand') return;
  state.mapArea = 'moved-by-hand';
}

document.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.input === 'search-places') {
    const typed = input.value.trim().toLowerCase();
    let found = 0;
    for (const place of panelsBox.querySelectorAll<HTMLElement>('.menu-place')) {
      place.hidden = typed ? !place.dataset.searchWords!.includes(typed) : place.dataset.listedBeforeSearching !== 'true';
      if (!place.hidden) found++;
    }
    element('.menu-nothing-found').hidden = found > 0;
  } else if (input.dataset.input === 'share-text') {
    state.shareTextAsTyped = input.value;
    element<HTMLAnchorElement>('#post-on-x').href = postOnXLink(view(), input.value);
  }
});

document.addEventListener('keydown', event => {
  if (!state) return;
  if (event.key === 'Escape' && (state.openPanel || state.popUpPlaceCode)) return change(state.openPanel ? { openPanel: null, placeListCountryCode: null } : { popUpPlaceCode: null });
  const focused = document.activeElement as HTMLElement | null;
  if (!focused) return;
  if (event.key === 'Tab' && state.openPanel) {
    // Focus stays inside an open panel.
    const focusable = [...panelsBox.querySelectorAll<HTMLElement>('button, input, textarea, a[href]')].filter(each => each.offsetParent && each.tabIndex >= 0);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && focused === first) { last.focus(); event.preventDefault(); } else if (!event.shiftKey && focused === last) { first.focus(); event.preventDefault(); }
    return;
  }
  const isForwards = event.key === 'ArrowRight' || event.key === 'ArrowDown', isBackwards = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
  if (!isForwards && !isBackwards) return;
  const group = focused.closest<HTMLElement>('[role="radiogroup"], .menu-list, .menu-columns');
  if (!group || focused.tagName === 'INPUT') return;
  const choices = [...group.querySelectorAll<HTMLElement>('button:not([hidden])')];
  const next = choices[(choices.indexOf(focused) + (isForwards ? 1 : -1) + choices.length) % choices.length];
  event.preventDefault();
  // Arrow keys choose in a row of radio buttons, as they do in the browser's own; elsewhere they only move.
  if (group.getAttribute('role') === 'radiogroup') { next.focus(); next.click(); } else next.focus();
});

// Pointing at or focusing a map label lights up its place on the map.
function lightUpPlaceOf(target: HTMLElement | null): void {
  priceMap?.lightUp(target?.dataset.lightsUp ?? null);
}
document.addEventListener('pointerover', event => lightUpPlaceOf((event.target as Element).closest<HTMLElement>('[data-lights-up]')));
document.addEventListener('focusin', event => lightUpPlaceOf((event.target as Element).closest<HTMLElement>('[data-lights-up]')));

addEventListener('popstate', () => {
  state = stateFromAddress();
  drawEverything();
  priceMap.showArea(state.mapArea, false);
});

let redrawForNewSize = 0;
addEventListener('resize', () => {
  cancelAnimationFrame(redrawForNewSize);
  redrawForNewSize = requestAnimationFrame(() => {
    if (priceMap.fitToContainer()) { priceMap.buildLabels(view()); priceMap.showArea(mapAreas[state.mapArea] ? state.mapArea : 'world', false); }
    drawAnswer();
    drawPanels();
  });
});

// ---------- starting ----------

async function fileBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

try {
  const [snapshotBytes, mapPlaces] = await Promise.all([fileBytes(PRICE_SNAPSHOT_PATH), fetch(MAP_PLACES_PATH).then(response => response.json())]);
  snapshot = fromBinary(PriceSnapshotSchema, snapshotBytes);
  state = stateFromAddress();
  comparison = priceComparison(snapshot, state);
  priceMap = createPriceMap(mapBox, mapPlaces, placeCode => { if (placeCode || state.popUpPlaceCode) change({ popUpPlaceCode: placeCode }); }, () => { mapMovedByHand(); placePopUp(); });
  drawEverything();
  priceMap.showArea(state.mapArea, false);
  history.replaceState(null, '', addressOfState());
  document.documentElement.dataset.page = 'ready';
  findOpenerCountry().catch(problem => console.error('Could not find the opener’s country', problem));
} catch (problem) {
  console.error(problem);
  document.documentElement.dataset.page = 'failed';
  answer.innerHTML = '<div class="lead"><h1 class="lead-sentence lead-sentence-unpriced">The prices did not load.</h1><div class="lead-actions"><button type="button" class="button" data-action="load-again">Try again</button></div></div>';
}
