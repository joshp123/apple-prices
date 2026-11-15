// The page: reads the address, loads the snapshot and the map, draws every part, and redraws when the visitor chooses something.
import { fromBinary } from '@bufbuild/protobuf';
import type { UiPopoverElement } from '@ui-sdk/web';
import { PriceSnapshotSchema, type PriceSnapshot } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { countryCodeOf, isKnownPlaceCode, placeCodeForCountryCode, placeName, placeNameAfterIn } from '../src/places.ts';
import { canCompareWith, priceComparison, type PriceComparison } from '../src/price-comparison.ts';
import { postPicturePath, selectionFromShareLink, shareLinkPath } from '../src/share-link.ts';
import { specLine } from '../src/spec-words.ts';
import { answerHtml, drawAnswer, placeListHtml, placePicker, type PlacePickerPurpose } from './answer.ts';
import { isPhoneWidth, roleWordingOnPage, type PageState, type PageView } from './page-view.ts';
import { placePopUpHtml, popUpsHtml, shareDialogHtml, shareLink } from './pop-ups.ts';
import { createPriceMap, mapAreas, type PriceMap } from './price-map.ts';
import { currencyWords, drawProductBar, productBarHtml } from './product-bar.ts';

// Filled in by hosting/build.mjs: addresses that change when the file does.
declare const PRICE_SNAPSHOT_PATH: string;
declare const MAP_PLACES_PATH: string;

const element = <E extends HTMLElement>(selector: string) => document.querySelector<E>(selector)!;
const bar = element('#bar'), answer = element('#answer'), mapBox = element('#map'), popUps = element('#pop-ups');

let snapshot: PriceSnapshot, state: PageState, comparison: PriceComparison, priceMap: PriceMap;
// On a phone the map opens on the places the answer names, which a whole world would show too small; elsewhere on the world.
let mapArea = isPhoneWidth() ? 'named-places' : 'world';
function setMapArea(area: string): void {
  mapArea = area;
}
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

// The address is the share link: what is shown, nothing about which list is open.
const stateFromAddress = (): PageState => ({ ...selectionFromShareLink(snapshot, new URL(location.href)), popUpPlaceCode: null, locationProblem: '' });
const chosenPrices = () => [state.productId, state.configurationId, state.visitorPlaceCode, state.comparedPlaceCode, state.displayCurrencyCode, state.pricesIncludeTax].join(' ');

function announce(message: string): void {
  element('#announcer').textContent = message;
}

// ---------- drawing ----------

const placePopUp = () => element<UiPopoverElement>('#place-pop-up');
const countryCodesOnMap = () => [...priceMap.placeCodesOnMap].filter(code => /^[A-Z]{2}$/.test(code));

function drawEverything(): void {
  comparison = priceComparison(snapshot, state);
  drawProductBar(bar, view());
  drawAnswer(answer, view());
  priceMap.colourPlaces(view());
  priceMap.buildLabels(view());
  const taxSwitch = mapBox.querySelector<HTMLElement & { checked: boolean }>('#tax-switch')!;
  if (taxSwitch.checked !== state.pricesIncludeTax) taxSwitch.checked = state.pricesIncludeTax;
  if (state.popUpPlaceCode) popUps.querySelector('.pop-up-of-place')!.innerHTML = placePopUpHtml(view(), state.popUpPlaceCode);
  document.title = `${comparison.product.productName}: what it costs in each country`;
}

// ---------- changing ----------

function change(changes: Partial<PageState>): void {
  const pricesBefore = chosenPrices();
  Object.assign(state, changes);
  if (state.comparedPlaceCode === state.visitorPlaceCode) state.comparedPlaceCode = null;
  const product = snapshot.products.find(candidate => candidate.productId === state.productId)!;
  if (!product.configurations.some(candidate => candidate.configurationId === state.configurationId)) state.configurationId = product.configurations[0].configurationId;
  // A compared place keeps its place only while the product has a price there.
  const prices = priceComparison(snapshot, state).prices;
  if (state.comparedPlaceCode && !canCompareWith(snapshot, product, prices, state.visitorPlaceCode, state.comparedPlaceCode)) state.comparedPlaceCode = null;
  const pricesChanged = chosenPrices() !== pricesBefore;
  drawEverything();
  // Until the visitor moves the map themselves, it keeps the places the answer names in view as they change.
  if (pricesChanged && mapArea === 'named-places') showMapArea(true);
  // A new choice of prices is a step Back can undo.
  if (pricesChanged) history.pushState(null, '', shareLinkPath(state));
}

function openPlacePopUp(placeCode: string): void {
  state.popUpPlaceCode = placeCode;
  popUps.querySelector('.pop-up-of-place')!.innerHTML = placePopUpHtml(view(), placeCode);
  priceMap.colourPlaces(view());
  // The pop-up stands beside the place, and follows it as the map moves.
  const anchor = { getBoundingClientRect: () => { const { x, y } = priceMap.pointOnPage(placeCode); return new DOMRect(x, y, 0, 0); } };
  void placePopUp().api.open({ anchor });
}

const closePlacePopUp = () => placePopUp().api.close();

// ---------- where the visitor is ----------

function chooseVisitorPlace(placeCode: string): void {
  sessionStorage.setItem(visitorChosePlaceInThisTab, 'yes');
  placePicker(answer, 'visitor').api.close();
  closePlacePopUp();
  change({ visitorPlaceCode: placeCode, locationProblem: '' });
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
    history.replaceState(null, '', shareLinkPath(state));
  }
  drawEverything();
}

// The opener's own price, beside the shared place's unless the link already compares with somewhere.
function seePriceWhereOpened(): void {
  const sharedPlaceCode = state.visitorPlaceCode;
  sessionStorage.setItem(visitorChosePlaceInThisTab, 'yes');
  change({ visitorPlaceCode: openerPlaceCode, comparedPlaceCode: state.comparedPlaceCode ?? sharedPlaceCode });
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

type ChangeEvent<Value> = CustomEvent<{ value: Value }>;

function listenToControls(): void {
  const on = <Value>(selector: string, eventName: string, handler: (value: Value) => void) =>
    element(selector).addEventListener(eventName, event => handler((event as ChangeEvent<Value>).detail.value));
  on<string>('#product-select', 'valuechange', productId => {
    change({ productId, configurationId: '' });
    announce(comparison.product.productName);
  });
  on<string>('#configuration-select', 'valuechange', configurationId => {
    change({ configurationId });
    announce(specLine(comparison.product, comparison.configuration));
  });
  on<boolean>('#tax-switch', 'checkedchange', pricesIncludeTax => {
    change({ pricesIncludeTax });
    announce(pricesIncludeTax ? 'Prices include tax' : 'Prices before tax');
  });
  on<string>('#currency-select', 'valuechange', displayCurrencyCode => {
    change({ displayCurrencyCode });
    announce(`Prices in ${currencyWords(displayCurrencyCode)}`);
  });
  for (const purpose of ['visitor', 'compared'] as PlacePickerPurpose[]) {
    const picker = placePicker(answer, purpose);
    picker.itemToLabel = (code: unknown) => (code === 'none' ? 'No comparison' : placeName(snapshot, code as string));
    picker.addEventListener('openchange', event => {
      if (!(event as ChangeEvent<boolean>).detail.value) return;
      picker.querySelector('ui-combobox-list')!.innerHTML = placeListHtml(view(), purpose, countryCodesOnMap());
      picker.query = '';
    });
  }
  on<string>('#visitor-place', 'valuechange', placeCode => chooseVisitorPlace(placeCode));
  on<string>('#compared-place', 'valuechange', placeCode => {
    change({ comparedPlaceCode: placeCode === 'none' ? null : placeCode });
    announce(state.comparedPlaceCode ? `Comparing with ${placeNameAfterIn(snapshot, state.comparedPlaceCode)}` : 'No longer comparing');
  });
  on<boolean>('#place-pop-up', 'openchange', isOpen => {
    if (isOpen || !state.popUpPlaceCode) return;
    state.popUpPlaceCode = null;
    priceMap.colourPlaces(view());
  });
  on<boolean>('#share-dialog', 'openchange', isOpen => {
    if (isOpen) popUps.querySelector('#share-dialog ui-dialog-content')!.innerHTML = shareDialogHtml(view());
  });
}

document.addEventListener('click', event => {
  const clicked = (event.target as Element).closest<HTMLElement>('[data-action]');
  if (!clicked) return;
  const data = clicked.dataset;
  if (data.action === 'load-again') return location.reload();
  if (!state) return;
  switch (data.action) {
    case 'use-my-location': return useMyLocation();
    case 'see-price-where-opened': return seePriceWhereOpened();
    case 'open-visitor-place': return void placePicker(answer, 'visitor').api.open();
    case 'choose-visitor-place': return chooseVisitorPlace(data.place!);
    case 'compare-with':
      closePlacePopUp();
      change({ comparedPlaceCode: data.place || null });
      return announce(state.comparedPlaceCode ? `Comparing with ${placeNameAfterIn(snapshot, state.comparedPlaceCode)}` : 'No longer comparing');
    case 'show-place': return openPlacePopUp(data.place!);
    case 'show-map-area':
      closePlacePopUp();
      setMapArea(data.area!);
      return priceMap.showArea(mapArea, true);
    case 'zoom-map':
      priceMap.zoomBy(Number(data.by));
      return setMapArea('moved-by-hand');
    case 'copy-share-link':
      return void navigator.clipboard.writeText(shareLink(view())).then(
        () => { element('.share-status').textContent = 'Link copied.'; },
        () => { element('.share-status').textContent = 'This browser did not allow copying. Select the link above instead.'; });
    // Safari copies an image only when the clipboard is given the promise of it during the click, not the image after it loads.
    case 'copy-share-card':
      return void navigator.clipboard.write([new ClipboardItem({ 'image/png': fetch(postPicturePath(state)).then(response => response.blob()) })]).then(
        () => { element('.share-status').textContent = 'Picture copied.'; },
        () => { element('.share-status').textContent = 'This browser did not allow copying the picture. Use Save picture instead.'; });
  }
});

// Pointing at or focusing a map label lights up its place on the map.
function lightUpPlaceOf(target: HTMLElement | null): void {
  priceMap?.lightUp(target?.dataset.lightsUp ?? null);
}
document.addEventListener('pointerover', event => lightUpPlaceOf((event.target as Element).closest<HTMLElement>('[data-lights-up]')));
document.addEventListener('focusin', event => lightUpPlaceOf((event.target as Element).closest<HTMLElement>('[data-lights-up]')));

addEventListener('popstate', () => {
  closePlacePopUp();
  state = stateFromAddress();
  drawEverything();
});

// The map fills the screen under the bar and the answer, which sit on it; it fits the world, and its key and zoom, into what they leave.
let redrawForNewSize = 0;
function fitMapToWhatIsUncovered(): void {
  if (!priceMap) return;
  const mapBoxOnPage = mapBox.getBoundingClientRect();
  const top = Math.max(0, Math.round(bar.getBoundingClientRect().bottom - mapBoxOnPage.top));
  const bottom = Math.max(0, Math.round(mapBoxOnPage.bottom - answer.getBoundingClientRect().top));
  mapBox.style.setProperty('--covered-top', `${top}px`);
  mapBox.style.setProperty('--covered-bottom', `${bottom}px`);
  priceMap.setCovered(top, bottom);
  if (!priceMap.fitToContainer()) return;
  priceMap.buildLabels(view());
  showMapArea(false);
}

function showMapArea(isAnimated: boolean): void {
  // The visitor's place first: the map centres on it when the others do not fit across.
  const roles = ['visitor', 'compared', 'cheapest', 'most-expensive'];
  if (mapArea === 'named-places') priceMap.showPlaces([...comparison.columns].sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role)).map(column => column.placeCode), isAnimated);
  else priceMap.showArea(mapAreas[mapArea] ? mapArea : 'world', isAnimated);
}
const coverWatcher = new ResizeObserver(() => {
  cancelAnimationFrame(redrawForNewSize);
  redrawForNewSize = requestAnimationFrame(fitMapToWhatIsUncovered);
});
for (const watched of [mapBox, bar, answer]) coverWatcher.observe(watched);

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
  bar.innerHTML = productBarHtml;
  answer.innerHTML = answerHtml;
  popUps.innerHTML = popUpsHtml;
  priceMap = createPriceMap(mapBox, mapPlaces, placeCode => (placeCode ? openPlacePopUp(placeCode) : closePlacePopUp()), () => setMapArea('moved-by-hand'));
  listenToControls();
  drawEverything();
  setMapArea(mapArea);
  fitMapToWhatIsUncovered();
  history.replaceState(null, '', shareLinkPath(state));
  document.documentElement.dataset.page = 'ready';
  findOpenerCountry().catch(problem => console.error('Could not find the opener’s country', problem));
} catch (problem) {
  console.error(problem);
  document.documentElement.dataset.page = 'failed';
  answer.innerHTML = '<div class="answer-from-server"><h1>The prices did not load.</h1><button type="button" class="control" data-action="load-again">Try again</button></div>';
}

