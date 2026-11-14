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
const sideMargin = 48, topOfContent = 50, footerBaseline = 850;
// In a timeline the card is about 400 pixels wide, a quarter of its size, so no line of it is set smaller than this: 12 pixels there.
// Text that is too wide wraps; it never shrinks below this.
const smallestFontSize = 48;

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

type TextBlock = { lines: string[]; style: TextStyle; lineHeight: number };
const noText: TextBlock = { lines: [], style: { fontSize: smallestFontSize, fontWeight: 400 }, lineHeight: 0 };

// Words at one size, on as many lines as they need. Only a single word wider than the limit is set smaller, and never below the smallest size.
function wrappedBlock(text: string, style: TextStyle, widthLimit: number, lineHeight: number): TextBlock {
  if (!text) return noText;
  const widestWord = Math.max(...text.split(' ').map(word => textWidth(word, style)));
  const fontSize = Math.max(smallestFontSize, Math.min(style.fontSize, Math.floor(style.fontSize * widthLimit / widestWord)));
  const fitted = { ...style, fontSize };
  return { lines: wrappedLines(text, fitted, widthLimit), style: fitted, lineHeight: Math.round(lineHeight * fontSize / style.fontSize) };
}

// An amount as large as fits on one line. A range that would have to be small breaks after "to" instead.
function amountBlock(amount: string, style: TextStyle, widthLimit: number): TextBlock {
  const oneLineFontSize = largestFontSizeThatFits(amount, style, widthLimit), lineHeightFor = (fontSize: number) => Math.round(fontSize * 1.08);
  if (!amount.includes(' to ') || oneLineFontSize >= 64) return { lines: [amount], style: { ...style, fontSize: Math.max(smallestFontSize, oneLineFontSize) }, lineHeight: lineHeightFor(Math.max(smallestFontSize, oneLineFontSize)) };
  const lines = [`${amount.split(' to ')[0]} to`, amount.split(' to ')[1]];
  const fontSize = Math.max(smallestFontSize, Math.min(64, ...lines.map(line => largestFontSizeThatFits(line, style, widthLimit))));
  return { lines, style: { ...style, fontSize }, lineHeight: lineHeightFor(fontSize) };
}

// What one place says, top to bottom under its flag: who it is, its name, its price, the price in its own money, how far it is from the visitor's.
// Every place has the same five blocks, and each block is as tall as the tallest of its kind, so prices line up across the card.
function columnBlocks(comparison: PriceComparison, mark: PriceLineMark, widthLimit: number): TextBlock[] {
  const soft = { fontWeight: 400 as const, colour: softInkColour };
  const role = wrappedBlock(mark.roleWords, { fontSize: 48, ...soft, letterSpacingEm: -0.02 }, widthLimit, 54);
  const name = wrappedBlock(mark.placeName, { fontSize: 52, fontWeight: 600, letterSpacingEm: -0.02 }, widthLimit, 58);
  const words = priceWords(comparison, mark.placePrice, { shortenMillions: true });
  if (!words) return [role, name, wrappedBlock(unpricedWordsOnShareCard(mark.placePrice), { fontSize: 48, fontWeight: 600, letterSpacingEm: -0.02 }, widthLimit, 54), noText, noText];
  return [
    role, name,
    amountBlock(words.inDisplayCurrency, { fontSize: 88, fontWeight: 700, letterSpacingEm: -0.04 }, widthLimit),
    wrappedBlock(words.inLocalCurrency && `(${words.inLocalCurrency})`, { fontSize: 48, ...soft, letterSpacingEm: -0.015 }, widthLimit, 54),
    wrappedBlock(mark.placePrice.kind === 'priced' ? differenceFromVisitorWords(comparison, mark.placePrice.price, null) : '', { fontSize: 48, ...soft, letterSpacingEm: -0.015 }, widthLimit, 54),
  ];
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
  const title = textLine(product.productName, sideMargin, topOfContent, 78, { ...titleStyle, fontSize: Math.max(smallestFontSize, largestFontSizeThatFits(product.productName, titleStyle, textWidthBesidePhoto)) });
  const specsStyle: TextStyle = { fontSize: smallestFontSize, fontWeight: 400, letterSpacingEm: -0.015, colour: softInkColour };
  const specLines = wrappedLines(specLine(product, configuration), specsStyle, textWidthBesidePhoto), specsTop = topOfContent + 76, specLineHeight = 54;
  const specsSvg = specLines.map((line, index) => textLine(line, sideMargin, specsTop + index * specLineHeight, specLineHeight, specsStyle)).join('');
  const columnsTop = Math.max(specsTop + specLines.length * specLineHeight, topOfContent + photoBoxSize) + 12;

  const noteStyle: TextStyle = { fontSize: smallestFontSize, fontWeight: 400, letterSpacingEm: -0.015, colour: softInkColour };
  const noteLines = qualifications(comparison, named).flatMap(note => wrappedLines(note, noteStyle, contentWidth)), noteLineHeight = 54;
  const footerTop = footerBaseline - 50, notesTop = footerTop - 4 - noteLines.length * noteLineHeight;

  const columnWidth = contentWidth / named.length, columnTextWidthLimit = columnWidth - 20;
  const blocksByColumn = named.map(mark => columnBlocks(comparison, mark, columnTextWidthLimit));
  const blockHeights = blocksByColumn[0].map((_, blockIndex) => Math.max(...blocksByColumn.map(blocks => blocks[blockIndex].lines.length * blocks[blockIndex].lineHeight)));
  // A place with no price says so in one block that may run over the empty ones beneath it.
  const tallestText = Math.max(blockHeights.reduce((sum, height) => sum + height, 0), ...blocksByColumn.map(blocks => blocks.reduce((sum, block) => sum + block.lines.length * block.lineHeight, 0)));

  // Whatever height is left goes to the flags. When that would make them small, the round amounts under the line give way first:
  // the named places' own prices already label it.
  const bandHeight = 16, heightForFlags = (stemsHeight: number, ticksHeight: number) => notesTop - columnsTop - 8 - tallestText - 6 - stemsHeight - bandHeight - ticksHeight;
  const hasTicks = heightForFlags(44, 60) >= 60;
  const stemsHeight = hasTicks || heightForFlags(44, 14) >= 60 ? 44 : 30, ticksHeight = hasTicks ? 60 : 14;
  const flagHeight = Math.max(40, Math.min(92, heightForFlags(stemsHeight, ticksHeight)));
  const flagWidth = flagHeight * 1.5, textTop = columnsTop + flagHeight + 8;
  const stemsTop = textTop + tallestText + 6, bandTop = stemsTop + stemsHeight;

  const scale = priceLineScale(priceLineMarks(comparison, 'countries', roleWordingOnShareCard), contentWidth, 12);
  const positionOnCard = (priceInUsDollars: number) => sideMargin + scale.positionOf(priceInUsDollars);
  let columnsSvg = '', stemsSvg = '';
  named.forEach((mark, index) => {
    const isLastOfSeveral = index === named.length - 1 && named.length > 1;
    const anchor: TextAnchor = isLastOfSeveral ? 'end' : 'start';
    const textX = isLastOfSeveral ? shareCardWidth - sideMargin : sideMargin + index * columnWidth;
    const flagLeft = isLastOfSeveral ? textX - flagWidth : textX;
    columnsSvg += flag(pictures, mark.placeCode, flagLeft, columnsTop, flagHeight);
    const hasNoPrice = Number.isNaN(mark.lowestPriceInUsDollars);
    let blockTop = textTop;
    blocksByColumn[index].forEach((block, blockIndex) => {
      block.lines.forEach((line, lineIndex) => { columnsSvg += textLine(line, textX, blockTop + lineIndex * block.lineHeight, block.lineHeight, block.style, anchor); });
      blockTop += hasNoPrice && blockIndex >= 2 ? block.lines.length * block.lineHeight : blockHeights[blockIndex];
    });
    if (hasNoPrice) return;
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
  const tickStyle: TextStyle = { fontSize: smallestFontSize, fontWeight: 400, letterSpacingEm: -0.015, colour: softInkColour };
  const ticksSvg = !hasTicks ? '' : priceLineTicks(comparison, scale, 4).map(tick => {
    const x = sideMargin + tick.position, halfWidth = textWidth(tick.words, tickStyle) / 2;
    if (x - halfWidth < sideMargin || x + halfWidth > shareCardWidth - sideMargin) return '';
    return `<rect x="${(x - 1.5).toFixed(1)}" y="${bandTop + bandHeight}" width="3" height="8" fill="${softInkColour}"/>${textLine(tick.words, x - halfWidth, bandTop + bandHeight + 8, 50, tickStyle)}`;
  }).join('');
  const notesSvg = noteLines.map((note, index) => textLine(note, sideMargin, notesTop + index * noteLineHeight, noteLineHeight, noteStyle)).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${shareCardWidth}" height="${shareCardHeight}" viewBox="0 0 ${shareCardWidth} ${shareCardHeight}">
<defs><linearGradient id="price-colours" x1="0" x2="1" y1="0" y2="0">${gradientStops}</linearGradient></defs>
<rect width="${shareCardWidth}" height="${shareCardHeight}" fill="${paperColour}"/>
${title}${specsSvg}${productPhoto(pictures, shareCardWidth - sideMargin, topOfContent, photoBoxSize)}
${columnsSvg}
<rect x="${sideMargin}" y="${bandTop}" width="${contentWidth}" height="${bandHeight}" rx="${bandHeight / 2}" fill="url(#price-colours)"/>
${stemsSvg}${ticksSvg}${notesSvg}
${textLine('appleprices.jjpcodes.com', sideMargin, footerTop, 50, { fontSize: smallestFontSize, fontWeight: 600, letterSpacingEm: -0.02 })}
${textLine('slopped up by @jjpcodes', shareCardWidth - sideMargin, footerTop, 50, { fontSize: smallestFontSize, fontWeight: 400, letterSpacingEm: -0.02, colour: softInkColour }, 'end')}
</svg>`;
}

// The place codes whose flags the card for this comparison needs: each named place's country, and the place itself where it is a state or province.
export function flagCodesOnShareCard(comparison: PriceComparison): string[] {
  return [...new Set(comparison.columns.flatMap(column => [countryCodeOf(column.placeCode), column.placeCode]))];
}
