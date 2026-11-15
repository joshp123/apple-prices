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

// Two shapes of the same card, each one Twitter shows whole. A link's preview is 2:1, with the photo beside the rows; Twitter may trim
// it to 1.91:1, so the sides keep a wider margin. A picture attached to a post is 7:8, the shape of each tile when two pictures share a
// post, which Twitter also shows whole on its own; there the photo stands above the rows.
export type ShareCardShape = { width: number; height: number; sideMargin: number; photoAboveRows: boolean };
export const linkPreviewShape: ShareCardShape = { width: 1800, height: 900, sideMargin: 72, photoAboveRows: false };
export const postPictureShape: ShareCardShape = { width: 1400, height: 1600, sideMargin: 64, photoAboveRows: true };
const paperColour = shareCardPaperColour, inkColour = '#1d1d1f', softInkColour = '#5f5f67', photoTileColour = '#f2f2f4';
const topOfContent = 50, footerBelowBottom = 50;
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

// The card reads top to bottom: the product and its whole configuration across the card, then the photo beside one row per place.
// Every row has the same two lines at the same height: the role and the price; then the place's name, its local money and its
// difference from me, each in a column of its own, so every detail stands where the eye expects it. When the columns need more
// width the photo gives it up; legible prices come before a large photo. A US state's estimate is marked on its name and explained
// once, below the rows.
const titleStyle: TextStyle = { fontSize: 68, fontWeight: 700, letterSpacingEm: -0.03 };
const softStyle: TextStyle = { fontSize: smallestFontSize, fontWeight: 400, letterSpacingEm: -0.015, colour: softInkColour };
const amountStyle: TextStyle = { fontSize: 64, fontWeight: 700, letterSpacingEm: -0.035 };
const nameStyle: TextStyle = { fontSize: 54, fontWeight: 600, letterSpacingEm: -0.02 };
const unpricedStyle: TextStyle = { fontSize: smallestFontSize, fontWeight: 600, letterSpacingEm: -0.015 };
const titleLineHeight = 76, specLineHeight = 52, gapBelowSpecs = 24, gapBesidePhoto = 48, gapBelowPhoto = 32, footerAboveBodyBottom = 58;
const priceLine = 58, detailLine = 54, footnoteLine = 52, largestRowPadding = 18;
const flagHeight = 52, flagWidth = flagHeight * 1.5, flagGap = 24, columnGap = 36;
const largestPhotoTile = 600, smallestPhotoTile = 200, smallestPhotoTileAboveRows = 360;
const estimateFootnote = '* Population-weighted average sales tax';

const withSize = (style: TextStyle, fontSize: number): TextStyle => ({ ...style, fontSize });
const fitted = (text: string, style: TextStyle, widthLimit: number) => withSize(style, Math.max(smallestFontSize, largestFontSizeThatFits(text, style, widthLimit)));
const baselineOf = (lineTop: number, lineHeight: number, style: TextStyle) => lineTop + (lineHeight + style.fontSize * interCapitalHeightEm) / 2;
function textOnBaseline(text: string, x: number, baseline: number, style: TextStyle, anchor: TextAnchor = 'start'): string {
  return textLine(text, x, baseline - style.fontSize * interCapitalHeightEm, style.fontSize * interCapitalHeightEm, style, anchor);
}

// One row's words, before any are placed.
type RowWords = { row: CardRow; role: string; name: string; price: string; localMoney: string; difference: string; unpriced: string; isEstimate: boolean };

function rowWords(comparison: PriceComparison, row: CardRow): RowWords {
  const words = priceWords(comparison, row.placePrice, { shortenMillions: true });
  const isEstimate = salesTaxLabel(row.placePrice) === 'Population-weighted average';
  return {
    row, role: rolesWords(row.roles), name: placeName(comparison.snapshot, row.placeCode) + (isEstimate ? '*' : ''),
    price: words?.inDisplayCurrency ?? '', localMoney: words?.inLocalCurrency ? `(${words.inLocalCurrency})` : '',
    difference: row.placePrice.kind === 'priced' && !row.roles.includes('visitor') ? differenceFromVisitorWords(comparison, row.placePrice.price, null) : '',
    unpriced: words ? '' : unpricedWordsOnShareCard(row.placePrice), isEstimate,
  };
}

const widest = (texts: string[], style: TextStyle) => Math.max(0, ...texts.filter(Boolean).map(text => textWidth(text, style)));

export function shareCardSvg(comparison: PriceComparison, pictures: ShareCardPictures, shape: ShareCardShape): string {
  const { product, configuration } = comparison;
  const { width, height, sideMargin, photoAboveRows } = shape;
  const textRight = width - sideMargin, fullWidth = textRight - sideMargin, footerBaseline = height - footerBelowBottom, bodyBottom = footerBaseline - footerAboveBodyBottom;
  const title = fitted(product.productName, titleStyle, fullWidth);
  const specLines = wrappedLines(specLine(product, configuration), softStyle, fullWidth);
  const bodyTop = topOfContent + titleLineHeight + specLines.length * specLineHeight + gapBelowSpecs, bodyHeight = bodyBottom - bodyTop;

  const rows = cardRows(comparison).map(row => rowWords(comparison, row));
  const hasEstimate = rows.some(row => row.isEstimate);
  // The name column takes what the local money and difference columns leave; names shrink to the smallest size before the photo does.
  const differenceColumn = widest(rows.map(row => row.difference), softStyle), localColumn = widest(rows.map(row => row.localMoney), softStyle);
  const detailColumns = (localColumn ? localColumn + columnGap : 0) + (differenceColumn ? differenceColumn + columnGap : 0);
  const narrowestName = widest(rows.map(row => row.name), withSize(nameStyle, smallestFontSize));
  const narrowestPrice = Math.max(...rows.map(row => textWidth(row.role, softStyle) + columnGap + (row.price ? textWidth(row.price, withSize(amountStyle, smallestFontSize)) : textWidth(row.unpriced, unpricedStyle) / 2)));
  const rowsNeed = flagWidth + flagGap + Math.max(narrowestName + detailColumns, narrowestPrice);
  const footnoteHeight = hasEstimate ? footnoteLine + 8 : 0;
  const rowHeight = priceLine + detailLine;

  // Beside the rows the photo is a square that gives up width to them; above the rows it spans the card and takes the height they leave.
  const rowsHeightAtMost = rows.length * (rowHeight + largestRowPadding * 2) + footnoteHeight;
  const tile = photoAboveRows
    ? { left: sideMargin, top: bodyTop, width: fullWidth, height: Math.max(smallestPhotoTileAboveRows, bodyHeight - gapBelowPhoto - rowsHeightAtMost) }
    : (size => ({ left: sideMargin, top: bodyTop, width: size, height: size }))(Math.max(smallestPhotoTile, Math.min(largestPhotoTile, bodyHeight, fullWidth - gapBesidePhoto - rowsNeed)));
  const textLeft = photoAboveRows ? sideMargin : sideMargin + tile.width + gapBesidePhoto, rowsTop = photoAboveRows ? tile.top + tile.height + gapBelowPhoto : bodyTop;
  const nameLeft = textLeft + flagWidth + flagGap, rowWidth = textRight - nameLeft;
  const nameAt = withSize(nameStyle, Math.min(...rows.map(row => fitted(row.name, nameStyle, rowWidth - detailColumns).fontSize)));
  const localRight = textRight - (differenceColumn ? differenceColumn + columnGap : 0);

  // Every row is the same height, with the same air above and below; the spare height is shared out as that air.
  const rowPadding = Math.max(0, Math.min(largestRowPadding, (bodyBottom - rowsTop - footnoteHeight - rows.length * rowHeight) / (rows.length * 2)));
  const photoBoxSize = Math.min(tile.width, tile.height) * 5 / 6, photoLeft = tile.left + (tile.width - photoBoxSize) / 2, photoTop = tile.top + (tile.height - photoBoxSize) / 2;

  let svg = textLine(product.productName, sideMargin, topOfContent, titleLineHeight, title);
  specLines.forEach((line, index) => { svg += textLine(line, sideMargin, topOfContent + titleLineHeight + index * specLineHeight, specLineHeight, softStyle); });
  rows.forEach((row, index) => {
    const top = rowsTop + index * (rowHeight + rowPadding * 2) + rowPadding;
    if (index) svg += `<rect x="${textLeft}" y="${(top - rowPadding - 1).toFixed(1)}" width="${textRight - textLeft}" height="2" fill="${inkColour}" fill-opacity="0.1"/>`;
    const first = baselineOf(top, priceLine, amountStyle), second = baselineOf(top + priceLine, detailLine, nameAt);
    svg += flag(pictures, row.row.placeCode, textLeft, first - flagHeight + 6, flagHeight);
    svg += textOnBaseline(row.role, nameLeft, first, softStyle) + textOnBaseline(row.name, nameLeft, second, nameAt);
    if (row.price) {
      svg += textOnBaseline(row.price, textRight, first, fitted(row.price, amountStyle, rowWidth - textWidth(row.role, softStyle) - columnGap), 'end');
      if (row.localMoney) svg += textOnBaseline(row.localMoney, localRight, second, softStyle, 'end');
      if (row.difference) svg += textOnBaseline(row.difference, textRight, second, softStyle, 'end');
    } else {
      // No price: the reason stands where the price and its details would, on the row's own two lines.
      wrappedLines(row.unpriced, unpricedStyle, rowWidth - Math.max(textWidth(row.role, softStyle), textWidth(row.name, nameAt)) - columnGap).slice(0, 2)
        .forEach((line, lineIndex) => { svg += textOnBaseline(line, textRight, lineIndex ? second : first, unpricedStyle, 'end'); });
    }
  });
  if (hasEstimate) svg += textOnBaseline(estimateFootnote, textLeft, baselineOf(rowsTop + rows.length * (rowHeight + rowPadding * 2) + 8, footnoteLine, softStyle), softStyle);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${paperColour}"/>
<rect x="${tile.left}" y="${tile.top}" width="${tile.width}" height="${tile.height}" rx="${Math.min(tile.width, tile.height) / 15}" fill="${photoTileColour}"/>
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
