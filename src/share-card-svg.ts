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

// Every line of the card is measured before it is placed: the title, the specs, then one row per place, each as tall as its words need.
// A row is two lines: the role, then the price with its local money in brackets; the place's name, then how it differs from me and how
// tax was reached. Words that do not fit beside the name run on below it. The photo tile takes the width the words leave, never under 360.
const titleStyle: TextStyle = { fontSize: 72, fontWeight: 700, letterSpacingEm: -0.03 };
const softStyle: TextStyle = { fontSize: smallestFontSize, fontWeight: 400, letterSpacingEm: -0.015, colour: softInkColour };
const amountStyle: TextStyle = { fontSize: 68, fontWeight: 700, letterSpacingEm: -0.035 };
const nameStyle: TextStyle = { fontSize: 56, fontWeight: 600, letterSpacingEm: -0.02 };
const unpricedStyle: TextStyle = { fontSize: smallestFontSize, fontWeight: 600, letterSpacingEm: -0.015 };
const titleLineHeight = 80, specLineHeight = 56, amountLineHeight = 64, nameLineHeight = 56, smallPrintLineHeight = 52, gapBelowSpecs = 12;
const rowsBottomLimit = footerBaseline - 56, flagHeight = 56, flagWidth = flagHeight * 1.5, flagGap = 24, gap = 28;
// Each row has this much air above and below, unless the words only fit without it.
const photoTileSizes = [600, 560, 520, 480, 440, 400, 360], rowPaddings = [6, 0];

const withSize = (style: TextStyle, fontSize: number): TextStyle => ({ ...style, fontSize });
const fitted = (text: string, style: TextStyle, widthLimit: number) => withSize(style, Math.max(smallestFontSize, largestFontSizeThatFits(text, style, widthLimit)));

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

// localMoneyFits says whether the local money fitted beside the price, so a card puts it there in every row or in none.
type MeasuredRow = { height: number; localMoneyFits: boolean; draw: (top: number, extraPadding: number) => string };

type RowLayout = { textLeft: number; textRight: number; rowPadding: number; localMoneyBesidePrice: boolean };

function measuredRow(comparison: PriceComparison, pictures: ShareCardPictures, row: CardRow, { textLeft, textRight, rowPadding, localMoneyBesidePrice }: RowLayout): MeasuredRow {
  const nameLeft = textLeft + flagWidth + flagGap, width = textRight - nameLeft;
  const role = rolesWords(row.roles), name = placeName(comparison.snapshot, row.placeCode);
  const nameAt = fitted(name, nameStyle, width * 0.6), roleWidth = textWidth(role, softStyle), nameWidth = textWidth(name, nameAt);
  const lineTop = (top: number, line: number) => top + rowPadding + (line === 0 ? 0 : amountLineHeight + (line - 1) * smallPrintLineHeight);
  const flagAndNames = (top: number) => flag(pictures, row.placeCode, textLeft, top + rowPadding + 8, flagHeight)
    + textLine(role, nameLeft, lineTop(top, 0), amountLineHeight, softStyle) + textLine(name, nameLeft, lineTop(top, 1), nameLineHeight, nameAt);
  const words = priceWords(comparison, row.placePrice, { shortenMillions: true });
  if (!words) {
    // No price: the reason stands where the price would, beside the role and the name.
    const reasonLines = wrappedLines(unpricedWordsOnShareCard(row.placePrice), unpricedStyle, width - Math.max(roleWidth, nameWidth) - gap);
    const height = rowPadding * 2 + Math.max(amountLineHeight + nameLineHeight, reasonLines.length * smallPrintLineHeight);
    return { height, localMoneyFits: true, draw: (top, extraPadding) => flagAndNames(top + extraPadding) + reasonLines.map((line, index) => textLine(line, textRight, top + extraPadding + rowPadding + 6 + index * smallPrintLineHeight, smallPrintLineHeight, unpricedStyle, 'end')).join('') };
  }
  const amountAt = fitted(words.inDisplayCurrency, amountStyle, width - roleWidth - gap);
  const amountWidth = textWidth(words.inDisplayCurrency, amountAt);
  const localMoney = words.inLocalCurrency && `(${words.inLocalCurrency})`;
  const localMoneyFits = !localMoney || roleWidth + gap + textWidth(localMoney, softStyle) + 16 + amountWidth <= width;
  const localBesidePrice = !!localMoney && localMoneyBesidePrice && localMoneyFits;
  const difference = row.placePrice.kind === 'priced' && !row.roles.includes('visitor') ? differenceFromVisitorWords(comparison, row.placePrice.price, null) : '';
  const tax = salesTaxLabel(row.placePrice) === 'Population-weighted average' ? 'population-weighted average' : '';
  const smallPrint = [localBesidePrice ? '' : localMoney, difference, tax].filter(Boolean);
  const besideName = width - nameWidth - gap;
  // When not even the first part fits beside the name, the small print starts on the line below it.
  const startsBesideName = !smallPrint.length || textWidth(smallPrint[0], softStyle) <= besideName;
  const smallPrintLines = rightAlignedLines(smallPrint, startsBesideName ? besideName : width, width);
  const linesBelowName = Math.max(0, smallPrintLines.length - (startsBesideName ? 1 : 0));
  const height = rowPadding * 2 + amountLineHeight + nameLineHeight + linesBelowName * smallPrintLineHeight;
  return { height, localMoneyFits, draw: (rowTop, extraPadding) => {
    const top = rowTop + extraPadding;
    const amountRight = localBesidePrice ? textRight - textWidth(localMoney, softStyle) - 16 : textRight;
    const firstSmallPrintLine = startsBesideName ? 1 : 2;
    return flagAndNames(top)
      + textLine(words.inDisplayCurrency, amountRight, lineTop(top, 0), amountLineHeight, amountAt, 'end')
      + (localBesidePrice ? textLine(localMoney, textRight, lineTop(top, 0) + 6, amountLineHeight, softStyle, 'end') : '')
      + smallPrintLines.map((line, index) => textLine(line, textRight, lineTop(top, firstSmallPrintLine + index) + (index || startsBesideName ? 2 : 0), firstSmallPrintLine + index === 1 ? nameLineHeight : smallPrintLineHeight, softStyle, 'end')).join('');
  } };
}

export function shareCardSvg(comparison: PriceComparison, pictures: ShareCardPictures): string {
  const { product, configuration } = comparison;
  const textRight = shareCardWidth - sideMargin;
  const layoutFor = (tileSize: number, rowPadding: number, localMoneyBesidePrice: boolean) => {
    const textLeft = sideMargin + tileSize + 56, widthLimit = textRight - textLeft;
    const title = fitted(product.productName, titleStyle, widthLimit);
    const specLines = wrappedLines(specLine(product, configuration), softStyle, widthLimit);
    const rows = cardRows(comparison).map(row => measuredRow(comparison, pictures, row, { textLeft, textRight, rowPadding, localMoneyBesidePrice }));
    const rowsTop = topOfContent + titleLineHeight + specLines.length * specLineHeight + gapBelowSpecs;
    const spare = rowsBottomLimit - rowsTop - rows.reduce((sum, row) => sum + row.height, 0);
    const fits = spare >= 0 && (!localMoneyBesidePrice || rows.every(row => row.localMoneyFits));
    return { tileSize, textLeft, widthLimit, title, specLines, rows, rowsTop, fits, spare };
  };
  // The largest photo the words leave room for, with the local money beside each price where it fits in every row.
  const smallestTile = photoTileSizes[photoTileSizes.length - 1];
  const candidates = [...photoTileSizes.flatMap(size => [layoutFor(size, rowPaddings[0], true), layoutFor(size, rowPaddings[0], false)]), layoutFor(smallestTile, rowPaddings[1], false)];
  const layout = candidates.find(candidate => candidate.fits) ?? candidates[candidates.length - 1];
  const { tileSize, textLeft, widthLimit, title, specLines, rows, rowsTop, spare } = layout;
  // Spare height goes back to the rows as air, up to a limit, so a short card's rows do not huddle at the top.
  const extraPadding = Math.max(0, Math.min(14, spare / (rows.length * 2)));
  const tileLeft = sideMargin, tileTop = topOfContent, photoBoxSize = tileSize * 5 / 6;
  const photoLeft = tileLeft + (tileSize - photoBoxSize) / 2, photoTop = tileTop + (tileSize - photoBoxSize) / 2;

  let svg = textLine(product.productName, textLeft, topOfContent, titleLineHeight, title);
  specLines.forEach((line, index) => { svg += textLine(line, textLeft, topOfContent + titleLineHeight + index * specLineHeight, specLineHeight, softStyle); });
  let top = rowsTop;
  rows.forEach(({ height, draw }, index) => {
    if (index) svg += `<rect x="${textLeft}" y="${(top - 1).toFixed(1)}" width="${widthLimit}" height="2" fill="${inkColour}" fill-opacity="0.1"/>`;
    svg += draw(top, extraPadding);
    top += height + extraPadding * 2;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${shareCardWidth}" height="${shareCardHeight}" viewBox="0 0 ${shareCardWidth} ${shareCardHeight}">
<rect width="${shareCardWidth}" height="${shareCardHeight}" fill="${paperColour}"/>
<rect x="${tileLeft}" y="${tileTop}" width="${tileSize}" height="${tileSize}" rx="${tileSize / 15}" fill="${photoTileColour}"/>
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
