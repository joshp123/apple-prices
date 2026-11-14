// The share card as an SVG of text, rectangles and images, which the Worker turns into a PNG with resvg.
// Most people meet the site as this picture in a timeline about 400 pixels wide, so the sizes here are a quarter of what they look like.
import interAdvanceWidths from '../assets/fonts/inter-advance-widths.json' with { type: 'json' };
import { countryCodeOf, isStateOrProvince, placeName } from './places.ts';
import { differenceFromVisitorWords, priceWords, salesTaxLabel, unpricedWordsOnShareCard, type ComparisonColumn, type ComparisonRole, type PriceComparison } from './price-comparison.ts';
import { productPhotoPixels, shareCardPaperColour, type ProductPhoto } from './product-photos.ts';
import { specLine } from './spec-words.ts';

export type ShareCardPictures = {
  productPhoto: ProductPhoto;
  productPhotoDataUrl: string;
  // A country's flag by its code ("NL"), a state's or province's own flag by its code ("US-CA").
  flagDataUrls: Record<string, string>;
};

export const shareCardWidth = 1600, shareCardHeight = 900;
const paperColour = shareCardPaperColour, inkColour = '#1d1d1f', softInkColour = '#5f5f67', photoTileColour = '#f2f2f4';
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

// Apple's photo, cropped to the product inside its square canvas, centred in a square box.
function productPhoto(pictures: ShareCardPictures, boxLeft: number, boxTop: number, boxSize: number): string {
  const [left, photoTop, photoRight, bottom] = pictures.productPhoto.productBox;
  const scale = boxSize / Math.max(photoRight - left, bottom - photoTop), width = (photoRight - left) * scale, height = (bottom - photoTop) * scale;
  const x = boxLeft + (boxSize - width) / 2, y = boxTop + (boxSize - height) / 2;
  const cropped = `<clipPath id="product-photo-crop"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}"/></clipPath>`
    + `<image href="${pictures.productPhotoDataUrl}" x="${(x - left * scale).toFixed(1)}" y="${(y - photoTop * scale).toFixed(1)}" width="${(productPhotoPixels * scale).toFixed(1)}" height="${(productPhotoPixels * scale).toFixed(1)}" clip-path="url(#product-photo-crop)"/>`;
  // The card's copies are JPEGs on the paper colour; darkening lets the tile's grey show through that paper and through Apple's grey backdrops.
  return `<g style="mix-blend-mode:darken">${cropped}</g>`;
}

// One row per named place, in the order people read a comparison: me, the place I compare with, then the world's cheapest and most expensive.
const rowOrder: ComparisonRole[] = ['visitor', 'compared', 'cheapest', 'most-expensive'];
const roleWords: Record<ComparisonRole, string> = { visitor: 'Me', compared: 'Compared with', cheapest: 'Cheapest', 'most-expensive': 'Most expensive' };

type CardRow = { placeCode: string; roles: ComparisonRole[]; placePrice: ComparisonColumn['placePrice'] };

// A place that is two things at once (I live in the cheapest place) gets one row naming both.
function cardRows(comparison: PriceComparison): CardRow[] {
  const rows: CardRow[] = [];
  for (const role of rowOrder) {
    const column = comparison.columns.find(candidate => candidate.role === role);
    if (!column) continue;
    const sameplace = rows.find(row => row.placeCode === column.placeCode);
    if (sameplace) sameplace.roles.push(role);
    else rows.push({ placeCode: column.placeCode, roles: [role], placePrice: column.placePrice });
  }
  return rows;
}

const rolesWords = (roles: ComparisonRole[]) => roles.map((role, index) => (index ? roleWords[role].toLowerCase() : roleWords[role])).join(', ');

// The card reads top to bottom: the product and its whole configuration across the card, then the photo, large, beside one row per
// place. Every line is measured before it is placed. A row's first line is the role, the price and its local money, all on one baseline;
// its second is the place's name and how it differs from me, on another. A US state's estimate gets a line of its own, and words that do
// not fit beside the name run on below it.
const titleStyle: TextStyle = { fontSize: 72, fontWeight: 700, letterSpacingEm: -0.03 };
const softStyle: TextStyle = { fontSize: smallestFontSize, fontWeight: 400, letterSpacingEm: -0.015, colour: softInkColour };
const amountStyle: TextStyle = { fontSize: 68, fontWeight: 700, letterSpacingEm: -0.035 };
const nameStyle: TextStyle = { fontSize: 56, fontWeight: 600, letterSpacingEm: -0.02 };
const unpricedStyle: TextStyle = { fontSize: smallestFontSize, fontWeight: 600, letterSpacingEm: -0.015 };
const titleLineHeight = 80, specLineHeight = 56, gapBelowSpecs = 28, gapBesidePhoto = 48;
const bodyBottom = footerBaseline - 62, flagHeight = 56, flagWidth = flagHeight * 1.5, flagGap = 24, gap = 48, localMoneyGap = 16;
// Line heights for a row, roomy first; the tighter set is used only when the roomy one does not fit.
type RowMetrics = { amountLine: number; nameLine: number; smallLine: number };
const rowMetrics: RowMetrics[] = [{ amountLine: 66, nameLine: 58, smallLine: 52 }, { amountLine: 60, nameLine: 52, smallLine: 50 }];
const largestPhotoTile = 600, smallestPhotoTile = 320, narrowestRows = 820;

const withSize = (style: TextStyle, fontSize: number): TextStyle => ({ ...style, fontSize });
const fitted = (text: string, style: TextStyle, widthLimit: number) => withSize(style, Math.max(smallestFontSize, largestFontSizeThatFits(text, style, widthLimit)));

// Text placed on a given baseline, so words of different sizes on one line sit on the same one.
function textOnBaseline(text: string, x: number, baseline: number, style: TextStyle, anchor: TextAnchor = 'start'): string {
  return textLine(text, x, baseline - (style.fontSize * interCapitalHeightEm), style.fontSize * interCapitalHeightEm, style, anchor);
}
const baselineOf = (lineTop: number, lineHeight: number, style: TextStyle) => lineTop + (lineHeight + style.fontSize * interCapitalHeightEm) / 2;

// Lays the small print out from the right edge, joining whole parts ("(£1,999)", "$459 more") while they fit,
// and breaking a part only when it alone is too wide for its line.
function rightAlignedLines(parts: string[], firstLineWidth: number, otherLinesWidth: number): string[] {
  const lines: string[] = [], widthOfLine = (index: number) => (index === 0 ? firstLineWidth : otherLinesWidth);
  for (const part of parts) {
    const last = lines.length - 1;
    if (last >= 0 && textWidth(`${lines[last]}, ${part}`, softStyle) <= widthOfLine(last)) { lines[last] += `, ${part}`; continue; }
    if (last >= 0) lines[last] += ',';
    const width = widthOfLine(lines.length);
    lines.push(...(textWidth(part, softStyle) <= width ? [part] : wrappedLines(part, softStyle, width)));
  }
  return lines;
}

type RowLayout = { textLeft: number; textRight: number; metrics: RowMetrics; localMoneyBesidePrice: boolean };
// localMoneyFits says whether the local money fitted beside the price, so a card puts it there in every row or in none.
type MeasuredRow = { height: number; localMoneyFits: boolean; priceFits: boolean; draw: (top: number) => string };

function measuredRow(comparison: PriceComparison, pictures: ShareCardPictures, row: CardRow, { textLeft, textRight, metrics, localMoneyBesidePrice }: RowLayout): MeasuredRow {
  const { amountLine, nameLine, smallLine } = metrics;
  const nameLeft = textLeft + flagWidth + flagGap, width = textRight - nameLeft;
  const role = rolesWords(row.roles), name = placeName(comparison.snapshot, row.placeCode);
  const nameAt = fitted(name, nameStyle, width * 0.6), roleWidth = textWidth(role, softStyle), nameWidth = textWidth(name, nameAt);
  const firstBaseline = (top: number) => baselineOf(top, amountLine, amountStyle), secondBaseline = (top: number) => baselineOf(top + amountLine, nameLine, nameAt);
  const flagAndNames = (top: number) => flag(pictures, row.placeCode, textLeft, firstBaseline(top) - flagHeight + 4, flagHeight)
    + textOnBaseline(role, nameLeft, firstBaseline(top), softStyle) + textOnBaseline(name, nameLeft, secondBaseline(top), nameAt);
  const words = priceWords(comparison, row.placePrice, { shortenMillions: true });
  if (!words) {
    // No price: the reason stands where the price would.
    const reasonLines = wrappedLines(unpricedWordsOnShareCard(row.placePrice), unpricedStyle, width - Math.max(roleWidth, nameWidth) - gap);
    const height = Math.max(amountLine + nameLine, amountLine + (reasonLines.length - 1) * smallLine + 8);
    return { height, localMoneyFits: true, priceFits: true, draw: top => flagAndNames(top)
      + reasonLines.map((line, index) => textOnBaseline(line, textRight, firstBaseline(top) + index * smallLine, unpricedStyle, 'end')).join('') };
  }
  const amountAt = fitted(words.inDisplayCurrency, amountStyle, width - roleWidth - gap);
  const amountWidth = textWidth(words.inDisplayCurrency, amountAt);
  const localMoney = words.inLocalCurrency && `(${words.inLocalCurrency})`;
  const localMoneyFits = !localMoney || roleWidth + gap + amountWidth + localMoneyGap + textWidth(localMoney, softStyle) <= width;
  const localBesidePrice = !!localMoney && localMoneyBesidePrice && localMoneyFits;
  const difference = row.placePrice.kind === 'priced' && !row.roles.includes('visitor') ? differenceFromVisitorWords(comparison, row.placePrice.price, null) : '';
  const smallPrint = [localBesidePrice ? '' : localMoney, difference].filter(Boolean);
  const besideName = width - nameWidth - gap;
  // When not even the first part fits beside the name, the small print starts on the line below it.
  const startsBesideName = !smallPrint.length || textWidth(smallPrint[0], softStyle) <= besideName;
  const smallPrintLines = rightAlignedLines(smallPrint, startsBesideName ? besideName : width, width);
  const isEstimate = salesTaxLabel(row.placePrice) === 'Population-weighted average';
  const linesBelowName = Math.max(0, smallPrintLines.length - (startsBesideName ? 1 : 0)) + (isEstimate ? 1 : 0);
  const height = amountLine + nameLine + linesBelowName * smallLine;
  const priceFits = roleWidth + gap + amountWidth <= width;
  return { height, localMoneyFits, priceFits, draw: top => {
    const first = firstBaseline(top), second = secondBaseline(top);
    const amountRight = localBesidePrice ? textRight - textWidth(localMoney, softStyle) - localMoneyGap : textRight;
    const smallPrintBaselines = smallPrintLines.map((_, index) => (startsBesideName ? second + index * smallLine : second + (index + 1) * smallLine));
    const lastBaseline = smallPrintBaselines.length ? Math.max(second, smallPrintBaselines[smallPrintBaselines.length - 1]) : second;
    return flagAndNames(top)
      + textOnBaseline(words.inDisplayCurrency, amountRight, first, amountAt, 'end')
      + (localBesidePrice ? textOnBaseline(localMoney, textRight, first, softStyle, 'end') : '')
      + smallPrintLines.map((line, index) => textOnBaseline(line, textRight, smallPrintBaselines[index], softStyle, 'end')).join('')
      + (isEstimate ? textOnBaseline('population-weighted average', textRight, lastBaseline + smallLine, softStyle, 'end') : '');
  } };
}

export function shareCardSvg(comparison: PriceComparison, pictures: ShareCardPictures): string {
  const { product, configuration } = comparison;
  const textRight = shareCardWidth - sideMargin, fullWidth = textRight - sideMargin;
  const title = fitted(product.productName, titleStyle, fullWidth);
  const specLines = wrappedLines(specLine(product, configuration), softStyle, fullWidth);
  const bodyTop = topOfContent + titleLineHeight + specLines.length * specLineHeight + gapBelowSpecs, bodyHeight = bodyBottom - bodyTop;
  // The photo is a square as tall as the space below the specs allows; it gives up width, 40 pixels at a time, only when the rows need it.
  const largestTile = Math.min(largestPhotoTile, bodyHeight, fullWidth - gapBesidePhoto - narrowestRows);
  const layoutFor = (tileSize: number, metrics: RowMetrics, localMoneyBesidePrice: boolean) => {
    const textLeft = sideMargin + tileSize + gapBesidePhoto;
    const rows = cardRows(comparison).map(row => measuredRow(comparison, pictures, row, { textLeft, textRight, metrics, localMoneyBesidePrice }));
    const spare = bodyHeight - rows.reduce((sum, row) => sum + row.height, 0);
    return { tileSize, textLeft, rows, spare, fits: spare >= 0 && rows.every(row => row.priceFits) && (!localMoneyBesidePrice || rows.every(row => row.localMoneyFits)) };
  };
  const tileSizes = Array.from({ length: Math.floor((largestTile - smallestPhotoTile) / 40) + 1 }, (_, step) => largestTile - step * 40);
  const candidates = tileSizes.flatMap(size => rowMetrics.flatMap(metrics => [layoutFor(size, metrics, true), layoutFor(size, metrics, false)]));
  const { tileSize, textLeft, rows, spare } = candidates.find(candidate => candidate.fits) ?? candidates[candidates.length - 1];
  const widthLimit = textRight - textLeft;
  // The rows share the photo's height: spare height goes between them, up to a limit, so a short card's rows do not huddle at the top.
  const gapBetweenRows = rows.length > 1 ? Math.max(0, Math.min(40, spare / (rows.length - 1))) : 0;
  const photoBoxSize = tileSize * 5 / 6, photoLeft = sideMargin + (tileSize - photoBoxSize) / 2, photoTop = bodyTop + (tileSize - photoBoxSize) / 2;

  let svg = textLine(product.productName, sideMargin, topOfContent, titleLineHeight, title);
  specLines.forEach((line, index) => { svg += textLine(line, sideMargin, topOfContent + titleLineHeight + index * specLineHeight, specLineHeight, softStyle); });
  let top = bodyTop;
  rows.forEach(({ height, draw }, index) => {
    if (index) svg += `<rect x="${textLeft}" y="${(top - gapBetweenRows / 2 - 1).toFixed(1)}" width="${widthLimit}" height="2" fill="${inkColour}" fill-opacity="0.1"/>`;
    svg += draw(top);
    top += height + gapBetweenRows;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${shareCardWidth}" height="${shareCardHeight}" viewBox="0 0 ${shareCardWidth} ${shareCardHeight}">
<rect width="${shareCardWidth}" height="${shareCardHeight}" fill="${paperColour}"/>
<rect x="${sideMargin}" y="${bodyTop}" width="${tileSize}" height="${tileSize}" rx="${tileSize / 15}" fill="${photoTileColour}"/>
${productPhoto(pictures, photoLeft, photoTop, photoBoxSize)}
${svg}
${textLine('appleprices.jjpcodes.com', sideMargin, footerBaseline - 50, 50, { fontSize: smallestFontSize, fontWeight: 600, letterSpacingEm: -0.02 })}
${textLine('slopped up by @jjpcodes', textRight, footerBaseline - 50, 50, { fontSize: smallestFontSize, fontWeight: 400, letterSpacingEm: -0.02, colour: softInkColour }, 'end')}
</svg>`;
}

// The place codes whose flags the card for this comparison needs: each named place's country, and the place itself where it is a state or province.
export function flagCodesOnShareCard(comparison: PriceComparison): string[] {
  return [...new Set(comparison.columns.flatMap(column => [countryCodeOf(column.placeCode), column.placeCode]))];
}
