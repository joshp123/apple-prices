// The share card as an SVG of text, rectangles and images, which the Worker turns into a PNG with resvg.
// Most people meet the site as this picture in a timeline about 400 pixels wide, so the sizes here are a quarter of what they look like.
import interAdvanceWidths from '../assets/fonts/inter-advance-widths.json' with { type: 'json' };
import { countryCodeOf, isStateOrProvince, placeName } from './places.ts';
import { priceColour } from './price-colour.ts';
import { differenceFromVisitorWords, priceWords, salesTaxLabel, unpricedWordsOnShareCard, type PriceComparison } from './price-comparison.ts';
import { priceLineMarks, priceLineScale, priceLineTicks, roleWordingOnShareCard, type PriceLineMark } from './price-line.ts';
import { productPhotoPixels, shareCardPaperColour, type ProductPhoto } from './product-photos.ts';
import { specLine } from './spec-words.ts';

export type ShareCardPictures = {
  productPhoto: ProductPhoto;
  productPhotoDataUrl: string;
  // A country's flag by its code ("NL"), a state's or province's own flag by its code ("US-CA").
  flagDataUrls: Record<string, string>;
};

export const shareCardWidth = 1600, shareCardHeight = 900;
const paperColour = shareCardPaperColour, inkColour = '#1d1d1f', softInkColour = '#5f5f67';
// X crops link pictures to 1.91:1, so nothing sits in the top or bottom 44 pixels.
const sideMargin = 64, topOfContent = 50, footerBaseline = 848;

type FontWeight = 400 | 600 | 700;
type TextStyle = { fontSize: number; fontWeight: FontWeight; letterSpacingEm?: number; colour?: string };

const escapeXml = (text: string) => text.replace(/[<>&"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[character]!);

// Money keeps its currency beside it with a no-break space; Inter draws that as an ordinary space.
const withOrdinarySpaces = (text: string) => text.replaceAll('\u00a0', ' ');

function textWidth(textAsWritten: string, { fontSize, fontWeight, letterSpacingEm = 0 }: TextStyle): number {
  const text = withOrdinarySpaces(textAsWritten);
  const advanceWidths: Record<string, number> = interAdvanceWidths.advanceWidthsByWeight[fontWeight];
  let fontUnits = 0;
  for (const character of text) fontUnits += advanceWidths[character] ?? advanceWidths.M;
  return fontUnits / interAdvanceWidths.unitsPerEm * fontSize + letterSpacingEm * fontSize * Math.max(0, [...text].length - 1);
}

function largestFontSizeThatFits(text: string, style: TextStyle, widthLimit: number): number {
  return Math.min(style.fontSize, Math.floor(style.fontSize * widthLimit / textWidth(text, style)));
}

function wrappedLines(text: string, style: TextStyle, widthLimit: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const longerLine = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
    if (lines.length && textWidth(longerLine, style) <= widthLimit) lines[lines.length - 1] = longerLine;
    else lines.push(word);
  }
  return lines;
}

// The largest size, down to the smallest allowed, at which the text needs no more than the lines allowed.
function wrappedToFit(text: string, style: TextStyle, widthLimit: number, mostLines: number, smallestFontSize: number): { lines: string[]; fontSize: number } {
  for (let fontSize = style.fontSize; fontSize > smallestFontSize; fontSize -= 2) {
    const lines = wrappedLines(text, { ...style, fontSize }, widthLimit);
    if (lines.length <= mostLines && lines.every(line => textWidth(line, { ...style, fontSize }) <= widthLimit)) return { lines, fontSize };
  }
  return { lines: wrappedLines(text, { ...style, fontSize: smallestFontSize }, widthLimit), fontSize: smallestFontSize };
}

// Text whose capital letters sit in the middle of a line box.
const interCapitalHeightEm = 0.727;
type TextAnchor = 'start' | 'end';
function textLine(text: string, x: number, lineTop: number, lineHeight: number, style: TextStyle, anchor: TextAnchor = 'start'): string {
  const baseline = lineTop + (lineHeight + style.fontSize * interCapitalHeightEm) / 2;
  const letterSpacing = style.letterSpacingEm ? ` letter-spacing="${(style.letterSpacingEm * style.fontSize).toFixed(2)}"` : '';
  return `<text x="${x.toFixed(1)}" y="${baseline.toFixed(1)}" font-family="Inter" font-size="${style.fontSize}" font-weight="${style.fontWeight}" fill="${style.colour ?? inkColour}" text-anchor="${anchor}"${letterSpacing}>${escapeXml(withOrdinarySpaces(text))}</text>`;
}

let clipPathCount = 0;
// The middle of a picture, cut to a rounded box with a hairline round it.
function roundedPicture(dataUrl: string, x: number, y: number, width: number, height: number, cornerRadius: number): string {
  const clipPathId = `rounded-${++clipPathCount}`;
  return `<clipPath id="${clipPathId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}"/></clipPath>`
    + `<image href="${dataUrl}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipPathId})"/>`
    + `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}" fill="none" stroke="${inkColour}" stroke-opacity="0.2" stroke-width="1.5"/>`;
}

// A state or province is its country's flag with its own flag over the lower right corner.
function flag(pictures: ShareCardPictures, placeCode: string, left: number, top: number, height: number): string {
  const width = height * 1.5, countryFlag = pictures.flagDataUrls[countryCodeOf(placeCode)];
  if (!countryFlag) return '';
  const drawn = roundedPicture(countryFlag, left, top, width, height, height * 0.08);
  if (!isStateOrProvince(placeCode)) return drawn;
  const cornerWidth = width * 0.6, cornerHeight = height * 0.6, outline = height * 0.05;
  return drawn
    + `<rect x="${left + width - cornerWidth - outline}" y="${top + height - cornerHeight - outline}" width="${cornerWidth + outline}" height="${cornerHeight + outline}" rx="${height * 0.07}" fill="${paperColour}"/>`
    + roundedPicture(pictures.flagDataUrls[placeCode], left + width - cornerWidth, top + height - cornerHeight, cornerWidth, cornerHeight, height * 0.05);
}

// Apple's photo, cropped to the product inside its square canvas, against the right edge.
function productPhoto(pictures: ShareCardPictures, right: number, top: number, boxSize: number): string {
  const [left, photoTop, photoRight, bottom] = pictures.productPhoto.productBox;
  const scale = boxSize / Math.max(photoRight - left, bottom - photoTop), width = (photoRight - left) * scale, height = (bottom - photoTop) * scale;
  const x = right - width, y = top + (boxSize - height) / 2;
  const cropped = `<clipPath id="product-photo-crop"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}"/></clipPath>`
    + `<image href="${pictures.productPhotoDataUrl}" x="${(x - left * scale).toFixed(1)}" y="${(y - photoTop * scale).toFixed(1)}" width="${(productPhotoPixels * scale).toFixed(1)}" height="${(productPhotoPixels * scale).toFixed(1)}" clip-path="url(#product-photo-crop)"/>`;
  return pictures.productPhoto.onOpaqueBackdrop ? `<g style="mix-blend-mode:darken">${cropped}</g>` : cropped;
}

type ColumnLine = { text: string; style: TextStyle; lineHeight: number };

// What one place says, top to bottom under its flag: who it is, its name, its price, the price in its own money, how far it is from the visitor's.
// Every place keeps the same lines at the same heights, so prices line up across the card; a line a place has nothing for stays empty.
function columnLines(comparison: PriceComparison, mark: PriceLineMark, widthLimit: number, isTight: boolean, hasLocalMoneyLine: boolean): ColumnLine[] {
  const soft = { fontWeight: 400 as const, colour: softInkColour };
  const fitted = (text: string, style: TextStyle, lineHeight: number): ColumnLine => ({ text, style: { ...style, fontSize: text ? largestFontSizeThatFits(text, style, widthLimit) : style.fontSize }, lineHeight });
  const lines = [fitted(mark.roleWords, { fontSize: 40, ...soft }, 48), fitted(mark.placeName, { fontSize: 50, fontWeight: 600, letterSpacingEm: -0.02 }, isTight ? 54 : 58)];
  const words = priceWords(comparison, mark.placePrice, { shortenMillions: true });
  if (!words) {
    const message = wrappedToFit(unpricedWordsOnShareCard(mark.placePrice), { fontSize: 48, fontWeight: 600, letterSpacingEm: -0.02 }, widthLimit, 3, 40);
    return [...lines, ...message.lines.map(text => ({ text, style: { fontSize: message.fontSize, fontWeight: 600 as const, letterSpacingEm: -0.02 }, lineHeight: Math.round(message.fontSize * 1.2) }))];
  }
  lines.push(fitted(words.inDisplayCurrency, { fontSize: 88, fontWeight: 700, letterSpacingEm: -0.04 }, isTight ? 88 : 96));
  if (hasLocalMoneyLine) lines.push(fitted(words.inLocalCurrency && `(${words.inLocalCurrency})`, { fontSize: 46, ...soft, letterSpacingEm: -0.015 }, 54));
  lines.push(fitted(mark.placePrice.kind === 'priced' ? differenceFromVisitorWords(comparison, mark.placePrice.price, 'me') : '', { fontSize: 40, ...soft }, 50));
  return lines;
}

// The small print a price needs to be honest, at a size that still reads in a timeline.
function qualifications(comparison: PriceComparison, marks: PriceLineMark[]): string[] {
  const notes = marks.filter(mark => mark.tiedPlacesWords).map(mark => `${mark.placeName} ${mark.tiedPlacesWords} cost the same`);
  if (marks.some(mark => salesTaxLabel(mark.placePrice) === 'Population-weighted average')) notes.push('US states: population-weighted average sales tax');
  return notes;
}

export function shareCardSvg(comparison: PriceComparison, pictures: ShareCardPictures): string {
  const { product, configuration, columns } = comparison;
  const contentWidth = shareCardWidth - 2 * sideMargin, photoBoxSize = 124;
  const cheapestPriceInUsDollars = comparison.prices[0].takeHomePriceInUsDollars;

  // The named places stand in price order, so the lines down to their prices never cross. A visitor's place with no price stands after the cheapest.
  const onLine = priceLineMarks(comparison, 'countries', roleWordingOnShareCard).filter(mark => mark.roles.length);
  const unpricedVisitor = columns.find(column => column.role === 'visitor' && !onLine.some(mark => mark.placeCode === column.placeCode));
  const middlePrice = (mark: PriceLineMark) => (mark.lowestPriceInUsDollars + mark.highestPriceInUsDollars) / 2;
  const named: PriceLineMark[] = [...onLine].sort((a, b) => middlePrice(a) - middlePrice(b));
  if (unpricedVisitor) {
    named.splice(1, 0, {
      placeCode: unpricedVisitor.placeCode, placeName: placeName(comparison.snapshot, unpricedVisitor.placeCode), lowestPriceInUsDollars: NaN, highestPriceInUsDollars: NaN,
      placePrice: unpricedVisitor.placePrice, roles: ['visitor'], roleWords: roleWordingOnShareCard.visitor, tiedPlacesWords: '',
    });
  }

  const titleStyle: TextStyle = { fontSize: 68, fontWeight: 700, letterSpacingEm: -0.03 };
  const textWidthBesidePhoto = contentWidth - photoBoxSize - 40;
  const title = textLine(product.productName, sideMargin, topOfContent, 78, { ...titleStyle, fontSize: largestFontSizeThatFits(product.productName, titleStyle, textWidthBesidePhoto) });
  const specs = wrappedToFit(specLine(product, configuration), { fontSize: 40, fontWeight: 400, letterSpacingEm: -0.01 }, textWidthBesidePhoto, 2, 36);
  const specsTop = topOfContent + 78, specLineHeight = 50;
  const specsSvg = specs.lines.map((line, index) => textLine(line, sideMargin, specsTop + index * specLineHeight, specLineHeight, { fontSize: specs.fontSize, fontWeight: 400, letterSpacingEm: -0.01, colour: softInkColour })).join('');
  const columnsTop = Math.max(specsTop + specs.lines.length * specLineHeight, topOfContent + photoBoxSize) + 20;

  const notes = qualifications(comparison, named);
  const noteLineHeight = 58, notesHeight = notes.length * noteLineHeight;
  const footerTop = footerBaseline - 44, notesTop = footerTop - 8 - notesHeight;

  // Whatever height is left over goes to the flags.
  const columnWidth = contentWidth / named.length, columnTextWidthLimit = columnWidth - 32;
  const layout = (isTight: boolean) => {
    const hasLocalMoneyLine = named.some(mark => priceWords(comparison, mark.placePrice)?.inLocalCurrency);
    const linesByColumn = named.map(mark => columnLines(comparison, mark, columnTextWidthLimit, isTight, hasLocalMoneyLine));
    const tallestText = Math.max(...linesByColumn.map(lines => lines.reduce((height, line) => height + line.lineHeight, 0)));
    const stemsHeight = isTight ? 34 : 56, bandHeight = 16, ticksHeight = isTight ? 40 : 52;
    const flagHeight = Math.min(88, notesTop - columnsTop - 10 - tallestText - 8 - stemsHeight - bandHeight - ticksHeight);
    return { linesByColumn, tallestText, stemsHeight, bandHeight, ticksHeight, flagHeight };
  };
  const roomy = layout(false);
  const { linesByColumn, tallestText, stemsHeight, bandHeight, ticksHeight, flagHeight } = roomy.flagHeight >= 64 ? roomy : layout(true);
  const flagWidth = flagHeight * 1.5, textTop = columnsTop + flagHeight + 10;
  const stemsTop = textTop + tallestText + 8, bandTop = stemsTop + stemsHeight;

  const scale = priceLineScale(priceLineMarks(comparison, 'countries', roleWordingOnShareCard), contentWidth, 12);
  const positionOnCard = (priceInUsDollars: number) => sideMargin + scale.positionOf(priceInUsDollars);
  let columnsSvg = '', stemsSvg = '';
  named.forEach((mark, index) => {
    const isLastOfSeveral = index === named.length - 1 && named.length > 1;
    const anchor: TextAnchor = isLastOfSeveral ? 'end' : 'start';
    const textX = isLastOfSeveral ? shareCardWidth - sideMargin : sideMargin + index * columnWidth;
    const flagLeft = isLastOfSeveral ? textX - flagWidth : textX;
    columnsSvg += flag(pictures, mark.placeCode, flagLeft, columnsTop, flagHeight);
    let lineTop = textTop;
    for (const line of linesByColumn[index]) { columnsSvg += textLine(line.text, textX, lineTop, line.lineHeight, line.style, anchor); lineTop += line.lineHeight; }
    if (Number.isNaN(mark.lowestPriceInUsDollars)) return;
    const lowest = positionOnCard(mark.lowestPriceInUsDollars), highest = positionOnCard(mark.highestPriceInUsDollars), middle = (lowest + highest) / 2;
    const stemStart = flagLeft + flagWidth / 2;
    stemsSvg += `<path d="M${stemStart.toFixed(1)} ${stemsTop}V${stemsTop + 6}L${middle.toFixed(1)} ${bandTop - 12}V${bandTop + bandHeight + 6}" fill="none" stroke="${inkColour}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
    // The United States or Canada as a whole is a span, not a point.
    if (highest - lowest > 4) stemsSvg += `<path d="M${lowest.toFixed(1)} ${bandTop - 12}H${highest.toFixed(1)}M${lowest.toFixed(1)} ${bandTop - 20}v16M${highest.toFixed(1)} ${bandTop - 20}v16" fill="none" stroke="${inkColour}" stroke-width="4" stroke-linecap="round"/>`;
    else stemsSvg += `<circle cx="${middle.toFixed(1)}" cy="${bandTop + bandHeight / 2}" r="9" fill="${paperColour}" stroke="${inkColour}" stroke-width="4"/>`;
  });

  const gradientStops = Array.from({ length: 25 }, (_, step) => {
    const priceInUsDollars = scale.lowestPriceInUsDollars + (scale.highestPriceInUsDollars - scale.lowestPriceInUsDollars) * step / 24;
    return `<stop offset="${(scale.positionOf(priceInUsDollars) / contentWidth).toFixed(4)}" stop-color="${priceColour(priceInUsDollars, cheapestPriceInUsDollars)}"/>`;
  }).join('');
  const tickStyle: TextStyle = { fontSize: 30, fontWeight: 400, colour: softInkColour };
  const ticksSvg = priceLineTicks(comparison, scale, 7).map(tick => {
    const x = sideMargin + tick.position, halfWidth = textWidth(tick.words, tickStyle) / 2;
    if (x - halfWidth < sideMargin || x + halfWidth > shareCardWidth - sideMargin) return '';
    return `<rect x="${(x - 1).toFixed(1)}" y="${bandTop + bandHeight}" width="2" height="6" fill="${softInkColour}"/>${textLine(tick.words, x - halfWidth, bandTop + bandHeight + 6, 34, tickStyle)}`;
  }).join('');

  const noteStyle: TextStyle = { fontSize: 48, fontWeight: 400, letterSpacingEm: -0.015, colour: softInkColour };
  const notesSvg = notes.map((note, index) => textLine(note, sideMargin, notesTop + index * noteLineHeight, noteLineHeight, noteStyle)).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${shareCardWidth}" height="${shareCardHeight}" viewBox="0 0 ${shareCardWidth} ${shareCardHeight}">
<defs><linearGradient id="price-colours" x1="0" x2="1" y1="0" y2="0">${gradientStops}</linearGradient></defs>
<rect width="${shareCardWidth}" height="${shareCardHeight}" fill="${paperColour}"/>
${title}${specsSvg}${productPhoto(pictures, shareCardWidth - sideMargin, topOfContent, photoBoxSize)}
${columnsSvg}
<rect x="${sideMargin}" y="${bandTop}" width="${contentWidth}" height="${bandHeight}" rx="${bandHeight / 2}" fill="url(#price-colours)"/>
${stemsSvg}${ticksSvg}${notesSvg}
${textLine('appleprices.jjpcodes.com', sideMargin, footerTop, 44, { fontSize: 40, fontWeight: 600, letterSpacingEm: -0.015 })}
${textLine('slopped up by @jjpcodes', shareCardWidth - sideMargin, footerTop, 44, { fontSize: 40, fontWeight: 400, letterSpacingEm: -0.015, colour: softInkColour }, 'end')}
</svg>`;
}

// The place codes whose flags the card for this comparison needs: each named place's country, and the place itself where it is a state or province.
export function flagCodesOnShareCard(comparison: PriceComparison): string[] {
  return [...new Set(comparison.columns.flatMap(column => [countryCodeOf(column.placeCode), column.placeCode]))];
}
