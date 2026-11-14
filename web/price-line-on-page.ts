// The price line under the map: the named places above the line, and on a wide screen every other place's flag hanging under it at its price.
import { priceColour } from '../src/price-colour.ts';
import { priceWords } from '../src/price-comparison.ts';
import { priceLineMarks, priceLineScale, priceLineTicks, rowsForHangingFlags, type PriceLineMark } from '../src/price-line.ts';
import { escapeHtml, flagHtml } from './html.ts';
import { isPhoneWidth, placesShownOnPriceLine, type PageView } from './page-view.ts';

const hangingFlagWidth = 30, hangingFlagHeight = 20, gapBetweenHangingFlags = 3, rowHeight = hangingFlagHeight + gapBetweenHangingFlags;

function namedPlaceHtml(view: PageView, mark: PriceLineMark): string {
  const amount = priceWords(view.comparison, mark.placePrice, { shortenMillions: true })!.inDisplayCurrency;
  return `<button type="button" class="named-place" data-action="show-place" data-place="${mark.placeCode}" data-from="price-line" data-focus="named-${mark.placeCode}" data-lights-up="${mark.placeCode}"
    aria-label="${escapeHtml(`${mark.roleWords}: ${mark.placeName}, ${amount}`)}">
    ${flagHtml(mark.placeCode, 'flag-of-named-place')}
    <span class="named-place-words"><span class="named-place-role">${escapeHtml(mark.roleWords)}</span><span class="named-place-name">${escapeHtml(mark.placeName)} <span class="amount">${amount}</span></span></span>
  </button>`;
}

export function drawPriceLine(container: HTMLElement, view: PageView): void {
  const { comparison, state } = view;
  const placesShown = placesShownOnPriceLine(state), isPhone = isPhoneWidth();
  const isChosen = (places: string) => placesShown === places;
  container.innerHTML = `<div class="price-line-head">
      <div class="segments segments-small" role="radiogroup" aria-label="Places on the price line">
        <button type="button" role="radio" class="segment" aria-checked="${isChosen('countries')}" tabindex="${isChosen('countries') ? 0 : -1}" data-action="show-on-price-line" data-places="countries" data-focus="line-countries">Countries</button>
        <button type="button" role="radio" class="segment" aria-checked="${isChosen('states-and-provinces')}" tabindex="${isChosen('states-and-provinces') ? 0 : -1}" data-action="show-on-price-line" data-places="states-and-provinces" data-focus="line-states-and-provinces"><span class="words-on-wide-screen">US states and Canadian provinces</span><span class="words-on-phone">States and provinces</span></button>
      </div>
      <button type="button" class="button button-quiet" data-action="open-panel" data-panel="all-prices" data-focus="open-all-prices">All prices</button>
    </div>
    <div class="price-line-plot" role="group" aria-label="Every place on one price line, cheapest on the left">
      <div class="named-places"></div><svg class="stems" aria-hidden="true"></svg><div class="ticks" aria-hidden="true"></div><div class="band" aria-hidden="true"></div>
      <div class="hanging-flags"></div><div class="names-under-line" aria-hidden="true"></div>
    </div>`;
  const plot = container.querySelector<HTMLElement>('.price-line-plot')!;
  const lineWidth = plot.clientWidth;
  const marks = priceLineMarks(comparison, placesShown, view.roleWording).sort((a, b) => a.lowestPriceInUsDollars - b.lowestPriceInUsDollars || a.placeName.localeCompare(b.placeName));
  const named = marks.filter(mark => mark.roles.length), others = marks.filter(mark => !mark.roles.length);

  // Flags hang at their exact price, a row lower where they would touch. Where more places share a price than there are rows,
  // the rest are a count in the last row, over the prices they span, that opens their names and prices.
  const hangingFlagsBox = plot.querySelector<HTMLElement>('.hanging-flags')!;
  const scale = priceLineScale(marks, lineWidth, hangingFlagWidth / 2 + 2);
  const spans = others.map(mark => {
    const lowest = scale.positionOf(mark.lowestPriceInUsDollars), highest = scale.positionOf(mark.highestPriceInUsDollars), middle = (lowest + highest) / 2;
    return { left: Math.min(lowest, middle - hangingFlagWidth / 2), right: Math.max(highest, middle + hangingFlagWidth / 2) };
  });
  const rowsThereIsRoomFor = Math.max(1, Math.floor((hangingFlagsBox.clientHeight + gapBetweenHangingFlags) / rowHeight));
  const rows = rowsForHangingFlags(spans, gapBetweenHangingFlags);
  const hasTooManyRows = Math.max(0, ...rows) >= rowsThereIsRoomFor, rowOfCounts = rowsThereIsRoomFor - 1;
  const isCounted = (index: number) => hasTooManyRows && rows[index] >= rowOfCounts;
  type Count = { left: number; right: number; placeCodes: string[] };
  const counts: Count[] = [];
  others.forEach((mark, index) => {
    if (!isCounted(index)) return;
    const last = counts[counts.length - 1];
    if (last && spans[index].left < last.right + gapBetweenHangingFlags) { last.right = Math.max(last.right, spans[index].right); last.placeCodes.push(mark.placeCode); }
    else counts.push({ ...spans[index], placeCodes: [mark.placeCode] });
  });
  // One place on its own in the last row hangs there as its flag.
  const hangsAsFlag = (index: number) => !isCounted(index) || counts.some(count => count.placeCodes.length === 1 && count.placeCodes[0] === others[index].placeCode);
  const countsOfSeveral = counts.filter(count => count.placeCodes.length > 1);
  const rowOf = (index: number) => Math.min(rows[index], rowOfCounts);
  const middleOf = (mark: PriceLineMark) => (scale.positionOf(mark.lowestPriceInUsDollars) + scale.positionOf(mark.highestPriceInUsDollars)) / 2;

  // Named places stand in one line above, each as near its price as its neighbours allow.
  const namedPlacesBox = plot.querySelector<HTMLElement>('.named-places')!;
  namedPlacesBox.innerHTML = named.map(mark => namedPlaceHtml(view, mark)).join('');
  const namedElements = [...namedPlacesBox.children] as HTMLElement[];
  const namedFlagWidth = namedElements[0]?.querySelector<HTMLElement>('.flag')!.offsetWidth ?? 0, gapBetweenNamedPlaces = isPhone ? 6 : 14;
  const blocks = named.map((mark, index) => {
    const width = namedElements[index].offsetWidth, position = middleOf(mark);
    const wordsOnTheLeft = position + width - namedFlagWidth / 2 > lineWidth;
    namedElements[index].classList.toggle('named-place-words-on-left', wordsOnTheLeft);
    const left = wordsOnTheLeft ? position - width + namedFlagWidth / 2 : position - namedFlagWidth / 2;
    return { mark, element: namedElements[index], width, wordsOnTheLeft, position, left: Math.max(0, Math.min(lineWidth - width, left)) };
  });
  for (let index = 1; index < blocks.length; index++) blocks[index].left = Math.max(blocks[index].left, blocks[index - 1].left + blocks[index - 1].width + gapBetweenNamedPlaces);
  for (let index = blocks.length - 1; index >= 0; index--) {
    const rightLimit = index === blocks.length - 1 ? lineWidth : blocks[index + 1].left - gapBetweenNamedPlaces;
    blocks[index].left = Math.max(0, Math.min(blocks[index].left, rightLimit - blocks[index].width));
  }
  const band = plot.querySelector<HTMLElement>('.band')!;
  const stemsTop = namedPlacesBox.offsetHeight, bandTop = band.offsetTop, bandBottom = bandTop + band.offsetHeight;
  let stems = '';
  for (const block of blocks) {
    block.element.style.transform = `translateX(${block.left}px)`;
    const flagCentre = block.wordsOnTheLeft ? block.left + block.width - namedFlagWidth / 2 : block.left + namedFlagWidth / 2;
    const lowest = scale.positionOf(block.mark.lowestPriceInUsDollars), highest = scale.positionOf(block.mark.highestPriceInUsDollars);
    stems += `<path d="M${flagCentre} ${stemsTop + 2}V${stemsTop + 5}L${block.position} ${stemsTop + 13}V${bandBottom + 3}"/>`;
    if (highest - lowest > 2) stems += `<path d="M${lowest} ${bandTop - 3}H${highest}M${lowest} ${bandTop - 6}v6M${highest} ${bandTop - 6}v6"/>`;
  }
  plot.querySelector('.stems')!.innerHTML = stems;

  plot.querySelector('.ticks')!.innerHTML = priceLineTicks(comparison, scale, isPhone ? 4 : 8).map(tick => {
    const isBesideAStem = blocks.some(block => Math.abs(block.position - tick.position) < 30);
    return isBesideAStem || tick.position < 24 || tick.position > lineWidth - 24 ? '' : `<span class="tick" style="transform:translateX(${tick.position}px)"><span>${tick.words}</span></span>`;
  }).join('');

  const cheapestPriceInUsDollars = comparison.prices[0].takeHomePriceInUsDollars;
  const colourStops = Array.from({ length: 25 }, (_, step) => {
    const priceInUsDollars = scale.lowestPriceInUsDollars + (scale.highestPriceInUsDollars - scale.lowestPriceInUsDollars) * step / 24;
    return `${priceColour(priceInUsDollars, cheapestPriceInUsDollars)} ${(scale.positionOf(priceInUsDollars) / lineWidth * 100).toFixed(2)}%`;
  });
  band.style.background = `linear-gradient(to right, ${colourStops.join(', ')})`;

  if (isPhone) {
    // On a phone the named places carry the line; each gets its name under its price, a row lower where names would touch.
    const namesBox = plot.querySelector<HTMLElement>('.names-under-line')!;
    namesBox.innerHTML = named.map(mark => `<span class="name-under-line">${escapeHtml(mark.placeName)}</span>`).join('');
    const nameElements = [...namesBox.children] as HTMLElement[];
    const nameSpans = named.map((mark, index) => {
      const width = nameElements[index].offsetWidth, left = Math.max(0, Math.min(lineWidth - width, middleOf(mark) - width / 2));
      return { left, right: left + width };
    });
    const nameRows = rowsForHangingFlags(nameSpans, 8);
    nameElements.forEach((element, index) => { element.style.transform = `translate(${nameSpans[index].left}px,${nameRows[index] * element.offsetHeight}px)`; });
    namesBox.style.height = `${(Math.max(...nameRows) + 1) * (nameElements[0]?.offsetHeight ?? 0)}px`;
    return;
  }

  hangingFlagsBox.innerHTML = others.map((mark, index) => {
    if (!hangsAsFlag(index)) return '';
    const amount = priceWords(comparison, mark.placePrice, { shortenMillions: true })!.inDisplayCurrency, label = `${mark.placeName} ${amount}`;
    const lowest = scale.positionOf(mark.lowestPriceInUsDollars), highest = scale.positionOf(mark.highestPriceInUsDollars), middle = (lowest + highest) / 2;
    const span = highest - lowest > 2 ? `<span class="span-of-prices" style="left:${lowest - middle}px;width:${highest - lowest}px"></span>` : '';
    return `<button type="button" class="hanging-flag" style="transform:translate(${middle}px,${rowOf(index) * rowHeight}px)" tabindex="-1" data-action="show-place" data-place="${mark.placeCode}" data-from="price-line" data-index="${index}"
      data-focus="hanging-${mark.placeCode}" data-lights-up="${mark.placeCode}" data-tip="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${span}${flagHtml(mark.placeCode)}<span class="name-beside-flag" style="left:${spans[index].right - middle + hangingFlagWidth / 2 + 6}px" hidden>${escapeHtml(label)}</span></button>`;
  }).join('') + countsOfSeveral.map(count => `<button type="button" class="count-of-places" style="transform:translate(${count.left}px,${rowOfCounts * rowHeight}px);width:${count.right - count.left}px" tabindex="-1"
      data-action="list-places-at-one-price" data-places="${count.placeCodes.join(' ')}" data-focus="count-${count.placeCodes[0]}" aria-label="${count.placeCodes.length} more places at about this price. Show them.">+${count.placeCodes.length}</button>`).join('');
  hangingFlagsBox.querySelector<HTMLElement>('button')?.setAttribute('tabindex', '0');
  // A flag with nothing to its right in its row has its name and price written beside it.
  const countSpans = countsOfSeveral.map(count => ({ left: count.left, right: count.right, row: rowOfCounts }));
  const shownSpans = [...spans.map((span, index) => ({ ...span, row: rowOf(index) })).filter((_, index) => hangsAsFlag(index)), ...countSpans];
  for (const element of hangingFlagsBox.querySelectorAll<HTMLElement>('.hanging-flag')) {
    const index = Number(element.dataset.index), name = element.querySelector<HTMLElement>('.name-beside-flag')!;
    name.hidden = false;
    const nameRight = spans[index].right + 6 + name.offsetWidth;
    name.hidden = nameRight > lineWidth || shownSpans.some(other => other.row === rowOf(index) && other.left < nameRight + 6 && other.left >= spans[index].right);
  }
}
