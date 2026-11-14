// The map: every place coloured by its price, with a flag, name and price on as many places as the zoom has room for.
import { geoArea, geoCentroid, geoContains, geoMercator, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { feature } from 'topojson-client';
import { countriesTaxedByStateOrProvince, countryCodeOf, isStateOrProvince, placeName } from '../src/places.ts';
import { priceColour } from '../src/price-colour.ts';
import { formatMoney } from '../src/money.ts';
import { amountInCurrency, hasPrice, placePriceOf, priceWords } from '../src/price-comparison.ts';
import { countryName } from '../src/take-home-prices.ts';
import { escapeHtml, flagHtml, icons } from './html.ts';
import { isPhoneWidth, usEstimateNote, type PageView } from './page-view.ts';

type LongitudeAndLatitude = [number, number];
type MapArea = { words: string; southWestAndNorthEast: [LongitudeAndLatitude, LongitudeAndLatitude] | null; hasShortcut: boolean };
export const mapAreas: Record<string, MapArea> = {
  world: { words: 'World', southWestAndNorthEast: null, hasShortcut: true },
  'united-states': { words: 'United States', southWestAndNorthEast: [[-125, 24.5], [-66.5, 49.5]], hasShortcut: true },
  canada: { words: 'Canada', southWestAndNorthEast: [[-141, 41.5], [-52, 72]], hasShortcut: true },
  europe: { words: 'Europe', southWestAndNorthEast: [[-11, 35], [45, 66.5]], hasShortcut: true },
  'asia-pacific': { words: 'Asia-Pacific', southWestAndNorthEast: [[66, -47], [179, 46]], hasShortcut: true },
  'us-north-east': { words: 'US north-east', southWestAndNorthEast: [[-77.6, 38.4], [-69.6, 43.2]], hasShortcut: false },
  benelux: { words: 'Benelux', southWestAndNorthEast: [[2.4, 49.3], [7.4, 53.7]], hasShortcut: false },
  'eastern-mediterranean': { words: 'Eastern Mediterranean', southWestAndNorthEast: [[24, 26], [46, 42]], hasShortcut: false },
  'pearl-river-delta': { words: 'Hong Kong and Macau', southWestAndNorthEast: [[113.35, 21.95], [114.5, 22.6]], hasShortcut: false },
  singapore: { words: 'Singapore', southWestAndNorthEast: [[103.45, 1.1], [104.15, 1.55]], hasShortcut: false },
};
// Deep enough to tell Hong Kong from Macau and Rhode Island from Connecticut, and no deeper.
const deepestZoom = 64;
const zoomThatShowsStatesAndProvinces = 2.3;
const zoomThatNamesPlacesWithNoPrice = 2.6;
const zoomThatAllowsLabelsBesidePlaces = 1.5;
// Where a label points when the middle of the largest outline is the wrong spot.
const labelPointOverrides: Record<string, LongitudeAndLatitude> = {
  US: [-98.5, 39.5], CA: [-104, 57], NO: [9, 61], FR: [2.5, 46.6], RU: [60, 60], NZ: [172, -42.5], MY: [102.2, 4.2], CL: [-71, -33],
  'US-HI': [-155.5, 19.6], 'US-AK': [-152, 64], 'US-FL': [-81.6, 28.2], 'US-MI': [-84.7, 43.5], 'US-LA': [-92.4, 31], HK: [114.15, 22.37], MO: [113.56, 22.16], SG: [103.82, 1.35],
};

type PlaceOutline = { properties: { placeCode: string }; geometry: GeoJSON.Geometry };
type MapLabel = { placeCode: string; element: HTMLElement; point: LongitudeAndLatitude; area: number; showsPrice: boolean; isStateOrProvince: boolean; isCountryOfStatesOrProvinces: boolean; width: number; height: number };
type Box = { left: number; top: number; right: number; bottom: number };
type Line = { fromX: number; fromY: number; toX: number; toY: number };

const boxesTouch = (a: Box, b: Box, margin: number) => a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin;
function linesCross(a: Line, b: Line): boolean {
  const side = (line: Line, x: number, y: number) => Math.sign((line.toX - line.fromX) * (y - line.fromY) - (line.toY - line.fromY) * (x - line.fromX));
  return side(a, b.fromX, b.fromY) !== side(a, b.toX, b.toY) && side(b, a.fromX, a.fromY) !== side(b, a.toX, a.toY);
}
function lineTouchesBox(line: Line, box: Box): boolean {
  const corners = [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]];
  const isInside = (x: number, y: number) => x > box.left && x < box.right && y > box.top && y < box.bottom;
  return isInside(line.fromX, line.fromY) || isInside(line.toX, line.toY)
    || corners.some(([x, y], index) => linesCross(line, { fromX: x, fromY: y, toX: corners[(index + 1) % 4][0], toY: corners[(index + 1) % 4][1] }));
}

function largestOutline(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geometry.type !== 'MultiPolygon') return geometry;
  return geometry.coordinates.map(coordinates => ({ type: 'Polygon' as const, coordinates })).reduce((largest, polygon) => (geoArea(polygon) > geoArea(largest) ? polygon : largest));
}

export type PriceMap = ReturnType<typeof createPriceMap>;

export function createPriceMap(container: HTMLElement, placesTopology: unknown, whenPlaceIsClicked: (placeCode: string | null) => void, whenMovedByHand: () => void) {
  const topology = placesTopology as { objects: { places: unknown } };
  const places = (feature(topology as never, topology.objects.places as never) as unknown as { features: PlaceOutline[] }).features;
  const placeCodesOnMap = new Set(places.map(place => place.properties.placeCode));
  const projection = geoMercator().rotate([-11, 0]);
  const outlinePath = geoPath(projection);
  const labelPoints = new Map<string, LongitudeAndLatitude>(), areas = new Map<string, number>();
  for (const place of places) {
    const code = place.properties.placeCode, outline = largestOutline(place.geometry);
    labelPoints.set(code, labelPointOverrides[code] ?? geoCentroid(outline as never));
    areas.set(code, geoArea(outline as never));
  }
  for (const countryCode of countriesTaxedByStateOrProvince) {
    labelPoints.set(countryCode, labelPointOverrides[countryCode]);
    areas.set(countryCode, places.filter(place => countryCodeOf(place.properties.placeCode) === countryCode).reduce((sum, place) => sum + areas.get(place.properties.placeCode)!, 0));
  }

  container.innerHTML = `<svg class="map-drawing" role="application" tabindex="0" aria-label="Map of prices. Arrow keys move it; plus and minus zoom.">
      <defs><pattern id="no-price-hatch" patternUnits="userSpaceOnUse" width="5" height="5"><rect class="no-price-ground" width="5" height="5"/><path class="no-price-stripe" d="M-1 1l2-2M0 5l5-5M4 6l2-2"/></pattern></defs>
      <g class="map-land"></g></svg>
    <svg class="map-leaders" aria-hidden="true"></svg><div class="map-labels"></div>
    <div class="map-zoom"><button type="button" class="control map-world" data-action="show-map-area" data-area="world" hidden>World</button><button type="button" class="icon-button" data-action="zoom-map" data-by="2" aria-label="Zoom in">${icons.plus}</button><button type="button" class="icon-button" data-action="zoom-map" data-by="0.5" aria-label="Zoom out">${icons.minus}</button></div>
    <p class="map-key" aria-label="Map colours from the cheapest price to the most expensive"></p>`;
  const drawing = select<SVGSVGElement, unknown>(container.querySelector<SVGSVGElement>('.map-drawing')!);
  const land = drawing.select<SVGGElement>('.map-land');
  const labelsBox = container.querySelector<HTMLElement>('.map-labels')!, leadersBox = container.querySelector<SVGSVGElement>('.map-leaders')!;
  land.selectAll('path').data(places).join('path').attr('data-place', place => place.properties.placeCode);

  let size = { width: 0, height: 0 }, transform: ZoomTransform = zoomIdentity, labels: MapLabel[] = [], namedPlaceCodes: string[] = [];
  const zoomBehaviour: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>().scaleExtent([1, deepestZoom]).on('zoom', event => {
    transform = event.transform;
    land.attr('transform', transform.toString()).style('--zoom', String(transform.k));
    // The hatch on places with no price keeps its size on screen however far the map is zoomed.
    drawing.select('#no-price-hatch').attr('patternTransform', `scale(${1 / transform.k})`);
    placeLabels();
    if (event.sourceEvent) whenMovedByHand();
  });
  drawing.call(zoomBehaviour).on('dblclick.zoom', null);
  // Labels cover much of the map, so the wheel over one zooms the map beneath it.
  labelsBox.addEventListener('wheel', event => {
    event.preventDefault();
    drawing.node()!.dispatchEvent(new WheelEvent('wheel', event));
  }, { passive: false });
  drawing.on('click', event => {
    const placeCode = (event.target as Element).getAttribute('data-place');
    if (!placeCode || placeCode.startsWith('unnamed')) return whenPlaceIsClicked(null);
    whenPlaceIsClicked(isStateOrProvince(placeCode) && transform.k < zoomThatShowsStatesAndProvinces ? countryCodeOf(placeCode) : placeCode);
  });
  drawing.on('keydown', (event: KeyboardEvent) => {
    const step = 80, moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) drawing.call(zoomBehaviour.translateBy, moves[event.key][0] / transform.k, moves[event.key][1] / transform.k);
    else if (event.key === '+' || event.key === '=') drawing.call(zoomBehaviour.scaleBy, 2);
    else if (event.key === '-') drawing.call(zoomBehaviour.scaleBy, 0.5);
    else return;
    event.preventDefault();
    whenMovedByHand();
  });

  // Fits the world to the container. True when the container's size had changed.
  function fitToContainer(): boolean {
    if (container.clientWidth === size.width && container.clientHeight === size.height) return false;
    size = { width: container.clientWidth, height: container.clientHeight };
    const isPhone = isPhoneWidth(), sideMargin = isPhone ? 4 : 16;
    projection.fitExtent([[sideMargin, isPhone ? 8 : 16], [size.width - sideMargin, size.height - sideMargin]], { type: 'MultiPoint', coordinates: [[-169, -55], [-169, 73], [190, -55], [190, 73]] } as never);
    drawing.attr('viewBox', `0 0 ${size.width} ${size.height}`);
    land.selectAll<SVGPathElement, PlaceOutline>('path').attr('d', place => outlinePath(place.geometry as never));
    zoomBehaviour.translateExtent([[0, 0], [size.width, size.height]]).extent([[0, 0], [size.width, size.height]]);
    return true;
  }

  // On a tall phone map the whole world would sit in a thin band of sea; it is drawn up to a third larger instead,
  // trimming the far Pacific at both edges, and can be dragged.
  function worldOnPhone(): ZoomTransform {
    const k = Math.min(1.35, size.height / (size.width / 2));
    return k <= 1 ? zoomIdentity : zoomIdentity.translate(size.width / 2 * (1 - k), size.height / 2 * (1 - k)).scale(k);
  }

  function transformThatShows(areaName: string): ZoomTransform {
    const corners = mapAreas[areaName]?.southWestAndNorthEast;
    if (!corners) return isPhoneWidth() ? worldOnPhone() : zoomIdentity;
    const [left, bottom] = projection(corners[0])!, [right, top] = projection(corners[1])!;
    const isPhone = isPhoneWidth(), marginAbove = isPhone ? 16 : 32, margin = isPhone ? 10 : 28;
    const k = Math.min(deepestZoom, (size.width - 2 * margin) / (right - left), (size.height - marginAbove - margin) / (bottom - top));
    return zoomIdentity.translate(size.width / 2 - k * (left + right) / 2, (size.height + marginAbove - margin) / 2 - k * (top + bottom) / 2).scale(k);
  }

  function showArea(areaName: string, isAnimated: boolean): void {
    if (!mapAreas[areaName]) return;
    const target = transformThatShows(areaName);
    if (isAnimated && !matchMedia('(prefers-reduced-motion: reduce)').matches) drawing.transition().duration(480).call(zoomBehaviour.transform, target);
    else drawing.call(zoomBehaviour.transform, target);
  }

  function colourPlaces({ comparison, state }: PageView): void {
    const cheapestPriceInUsDollars = comparison.prices[0].takeHomePriceInUsDollars;
    land.selectAll<SVGPathElement, PlaceOutline>('path')
      .style('fill', place => {
        const price = comparison.priceByPlaceCode.get(place.properties.placeCode);
        return price ? priceColour(price.takeHomePriceInUsDollars, cheapestPriceInUsDollars) : null;
      })
      .attr('class', place => {
        const code = place.properties.placeCode;
        return `${comparison.priceByPlaceCode.has(code) ? 'has-price' : ''} ${code === state.visitorPlaceCode ? 'is-visitor-place' : ''} ${code === state.popUpPlaceCode ? 'is-shown-in-pop-up' : ''}`;
      });
    land.selectAll<SVGPathElement, unknown>('path.is-visitor-place, path.is-shown-in-pop-up').raise();
    drawKey(comparison, state.displayCurrencyCode);
  }

  // The key sits on the map it explains: the colours from the cheapest price to the dearest, and the hatch for places with no price.
  function drawKey(comparison: PageView['comparison'], displayCurrencyCode: string): void {
    const cheapest = comparison.prices[0], dearest = comparison.prices[comparison.prices.length - 1];
    const stops = Array.from({ length: 9 }, (_, step) => priceColour(cheapest.takeHomePriceInUsDollars + (dearest.takeHomePriceInUsDollars - cheapest.takeHomePriceInUsDollars) * step / 8, cheapest.takeHomePriceInUsDollars));
    const amount = (price: typeof cheapest) => formatMoney(amountInCurrency(comparison.snapshot, price, displayCurrencyCode), displayCurrencyCode, { shortenMillions: true });
    container.querySelector('.map-key')!.innerHTML = `<span class="amount">${amount(cheapest)}</span><span class="key-band" style="background:linear-gradient(90deg,${stops.join(',')})"></span><span class="amount">${amount(dearest)}</span>`
      + `<span class="key-no-price"><span class="swatch-no-price"></span>No price from Apple</span>`
      + (comparison.prices.some(price => price.salesTaxRegion && price.additionalSalesTaxPercent && price.territoryCode.startsWith('US-')) ? `<span class="key-estimate">${usEstimateNote}</span>` : '');
  }

  function buildLabels({ snapshot, comparison, roleWording }: PageView): void {
    namedPlaceCodes = comparison.columns.map(column => column.placeCode);
    const roleOf = new Map(comparison.columns.map(column => [column.placeCode, column.role]));
    const placePrice = (placeCode: string) => placePriceOf(snapshot, comparison.product, comparison.prices, placeCode);
    const pricedCodes = [...comparison.priceByPlaceCode.keys()].filter(code => labelPoints.has(code));
    const countriesOfStatesOrProvinces = countriesTaxedByStateOrProvince.filter(code => hasPrice(placePrice(code)));
    const codesWithNoPrice = [...placeCodesOnMap].filter(code => /^[A-Z]{2}$/.test(code) && !comparison.priceByPlaceCode.has(code) && !countriesTaxedByStateOrProvince.includes(code) && countryName(code) !== code);
    const priceLabelHtml = (code: string): string => {
      const name = placeName(snapshot, code), amount = priceWords(comparison, placePrice(code), { shortenMillions: true })!.inDisplayCurrency, role = roleOf.get(code);
      return `<button type="button" class="map-label ${role === 'visitor' ? 'map-label-of-visitor' : ''}" data-action="show-place" data-place="${code}" data-focus="label-${code}" data-lights-up="${code}" tabindex="-1"
        aria-label="${escapeHtml(`${role ? `${roleWording[role]}: ` : ''}${name}, ${amount}`)}">${flagHtml(code)}<span class="map-label-words"><span>${escapeHtml(name)}</span><span class="amount">${amount}</span></span></button>`;
    };
    const codesWithPriceLabels = [...pricedCodes, ...countriesOfStatesOrProvinces];
    labelsBox.innerHTML = codesWithPriceLabels.map(priceLabelHtml).join('') + codesWithNoPrice.map(code => `<span class="map-name">${escapeHtml(placeName(snapshot, code))}</span>`).join('');
    const elements = [...labelsBox.children] as HTMLElement[];
    labels = [...codesWithPriceLabels, ...codesWithNoPrice].map((code, index) => ({
      placeCode: code, element: elements[index], point: labelPoints.get(code)!, area: areas.get(code) ?? 0, showsPrice: index < codesWithPriceLabels.length,
      isStateOrProvince: isStateOrProvince(code), isCountryOfStatesOrProvinces: countriesOfStatesOrProvinces.includes(code), width: elements[index].offsetWidth, height: elements[index].offsetHeight,
    }));
    placeLabels();
  }

  // The four named places first, then the largest places. A label that does not fit on its place stands beside it on a short line;
  // no line crosses another line or a label.
  function placeLabels(): void {
    if (!labels.length) return;
    const k = transform.k, isPhone = isPhoneWidth(), showsStatesAndProvinces = k >= zoomThatShowsStatesAndProvinces;
    const containerBox = container.getBoundingClientRect();
    const takenBoxes: Box[] = ['.map-zoom', '.map-key'].map(selector => {
      const box = container.querySelector(selector)!.getBoundingClientRect();
      return { left: box.left - containerBox.left, top: box.top - containerBox.top, right: box.right - containerBox.left, bottom: box.bottom - containerBox.top };
    });
    const leaders: Line[] = [];
    const isNamed = (label: MapLabel) => namedPlaceCodes.includes(label.placeCode);
    const importance = (label: MapLabel) => (isNamed(label) ? 3 : label.isCountryOfStatesOrProvinces ? 2 : label.showsPrice ? 1 : 0);
    const candidates = labels.filter(label => {
      if (isPhone && k < 1.8) return isNamed(label);
      if (label.isStateOrProvince) return showsStatesAndProvinces || isNamed(label);
      if (label.isCountryOfStatesOrProvinces) return !showsStatesAndProvinces;
      return label.showsPrice || k >= zoomThatNamesPlacesWithNoPrice;
    }).sort((a, b) => importance(b) - importance(a) || b.area - a.area);
    const shown = new Set<MapLabel>();
    let leadersDrawing = '';
    for (const label of candidates) {
      const [x, y] = transform.apply(projection(label.point)!);
      if (x < 0 || x > size.width || y < 0 || y > size.height) continue;
      const placeSizeOnScreen = Math.sqrt(label.area) * 180 / Math.PI * (size.width / 360) * k;
      if (!label.showsPrice && placeSizeOnScreen < label.width * 0.9) continue;
      const offsets: [number, number][] = [[0, 0]];
      if (label.showsPrice && (k >= zoomThatAllowsLabelsBesidePlaces || isNamed(label) || label.isCountryOfStatesOrProvinces)) {
        const dx = label.width / 2 + Math.min(18, placeSizeOnScreen / 2 + 8), dy = label.height / 2 + Math.min(14, placeSizeOnScreen / 2 + 6);
        offsets.push([dx, 0], [-dx, 0], [0, -dy], [0, dy], [dx, -dy], [dx, dy], [-dx, -dy], [-dx, dy], [dx * 1.4, -dy * 1.8], [dx * 1.4, dy * 1.8], [-dx * 1.4, -dy * 1.8], [-dx * 1.4, dy * 1.8]);
      }
      for (const [dx, dy] of offsets) {
        const box = { left: x + dx - label.width / 2, top: y + dy - label.height / 2, right: x + dx + label.width / 2, bottom: y + dy + label.height / 2 };
        if (box.left < 4 || box.right > size.width - 4 || box.top < 4 || box.bottom > size.height - 4) continue;
        if (takenBoxes.some(taken => boxesTouch(box, taken, 4)) || leaders.some(leader => lineTouchesBox(leader, box))) continue;
        const isBesideItsPlace = dx !== 0 || dy !== 0;
        const leader: Line = { fromX: x, fromY: y, toX: x + dx - Math.sign(dx) * Math.min(Math.abs(dx), label.width / 2), toY: y + dy - Math.sign(dy) * Math.min(Math.abs(dy), label.height / 2) };
        if (isBesideItsPlace && (leaders.some(other => linesCross(leader, other)) || takenBoxes.some(taken => lineTouchesBox(leader, taken)))) continue;
        takenBoxes.push(box);
        label.element.style.transform = `translate(${Math.round(box.left)}px,${Math.round(box.top)}px)`;
        if (isBesideItsPlace) {
          leaders.push(leader);
          leadersDrawing += `<path d="M${leader.fromX} ${leader.fromY}L${leader.toX} ${leader.toY}"/><circle cx="${x}" cy="${y}" r="2.2"/>`;
        }
        shown.add(label);
        break;
      }
    }
    for (const label of labels) label.element.hidden = !shown.has(label);
    leadersBox.innerHTML = leadersDrawing;
  }

  return {
    fitToContainer, showArea, colourPlaces, buildLabels,
    zoomBy: (factor: number) => drawing.transition().duration(240).call(zoomBehaviour.scaleBy, factor),
    lightUp(placeCode: string | null): void {
      land.selectAll('path.is-lit').classed('is-lit', false);
      if (!placeCode) return;
      const isLit = (code: string) => code === placeCode || (!isStateOrProvince(placeCode) && countriesTaxedByStateOrProvince.includes(placeCode) && countryCodeOf(code) === placeCode);
      land.selectAll<SVGPathElement, PlaceOutline>('path').filter(place => isLit(place.properties.placeCode)).classed('is-lit', true);
    },
    // Where a place's label point is on the page now, for the pop-up to stand beside.
    pointOnPage(placeCode: string): { x: number; y: number } {
      const [x, y] = transform.apply(projection(labelPoints.get(placeCode) ?? labelPoints.get(countryCodeOf(placeCode))!)!);
      const box = container.getBoundingClientRect();
      return { x: box.left + Math.max(0, Math.min(size.width, x)), y: box.top + Math.max(0, Math.min(size.height, y)) };
    },
    // The state, province or country a point on the Earth is in. Worked out here in the browser; the point goes nowhere else.
    placeCodeAt(longitude: number, latitude: number): string | null {
      const place = places.find(candidate => !candidate.properties.placeCode.startsWith('unnamed') && geoContains(candidate.geometry as never, [longitude, latitude]));
      return place?.properties.placeCode ?? null;
    },
    placeCodesOnMap,
  };
}
