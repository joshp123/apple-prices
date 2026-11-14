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

export function shareCardSvg(comparison: PriceComparison, pictures: ShareCardPictures): string {
  const { product, configuration } = comparison;
  const softStyle = (fontSize: number): TextStyle => ({ fontSize, fontWeight: 400, letterSpacingEm: -0.015, colour: softInkColour });

  // The product photo fills the left of the card on a tile of Apple's own backdrop grey, so photos Apple shot on grey sit in it seamlessly.
  const tileSize = 600, tileLeft = sideMargin, tileTop = topOfContent, photoBoxSize = 500;
  const photoLeft = tileLeft + (tileSize - photoBoxSize) / 2, photoTop = tileTop + (tileSize - photoBoxSize) / 2;
  const textLeft = tileLeft + tileSize + 56, textRight = shareCardWidth - sideMargin, textWidthLimit = textRight - textLeft;

  const titleStyle: TextStyle = { fontSize: 72, fontWeight: 700, letterSpacingEm: -0.03 };
  const titleFontSize = Math.max(smallestFontSize, largestFontSizeThatFits(product.productName, titleStyle, textWidthLimit));
  let svg = textLine(product.productName, textLeft, topOfContent, 82, { ...titleStyle, fontSize: titleFontSize });
  const specsStyle = softStyle(smallestFontSize), specLineHeight = 56;
  const specLines = wrappedLines(specLine(product, configuration), specsStyle, textWidthLimit);
  specLines.forEach((line, index) => { svg += textLine(line, textLeft, topOfContent + 84 + index * specLineHeight, specLineHeight, specsStyle); });

  const rows = cardRows(comparison);
  const rowsTop = topOfContent + 84 + specLines.length * specLineHeight + 24, rowsBottom = footerBaseline - 80;
  const rowHeight = (rowsBottom - rowsTop) / rows.length;
  const flagHeight = Math.min(64, rowHeight - 50), flagWidth = flagHeight * 1.5, nameLeft = textLeft + flagWidth + 24;

  rows.forEach((row, index) => {
    const top = rowsTop + index * rowHeight;
    if (index) svg += `<rect x="${textLeft}" y="${(top - 1).toFixed(1)}" width="${textWidthLimit}" height="2" fill="${inkColour}" fill-opacity="0.1"/>`;
    svg += flag(pictures, row.placeCode, textLeft, top + 16, flagHeight);
    svg += textLine(rolesWords(row.roles), nameLeft, top + 6, 52, softStyle(smallestFontSize));
    const name = placeName(comparison.snapshot, row.placeCode);
    const nameStyle: TextStyle = { fontSize: Math.max(smallestFontSize, largestFontSizeThatFits(name, { fontSize: 56, fontWeight: 600 }, 360)), fontWeight: 600, letterSpacingEm: -0.02 };
    svg += textLine(name, nameLeft, top + 56, 60, nameStyle);
    const nameRight = nameLeft + Math.max(textWidth(name, nameStyle), textWidth(rolesWords(row.roles), softStyle(smallestFontSize)));

    const words = priceWords(comparison, row.placePrice, { shortenMillions: true });
    if (!words) {
      const unpriced = unpricedWordsOnShareCard(row.placePrice);
      const unpricedStyle: TextStyle = { fontSize: smallestFontSize, fontWeight: 600, letterSpacingEm: -0.015 };
      wrappedLines(unpriced, unpricedStyle, textRight - nameRight - 32).forEach((line, lineIndex) => {
        svg += textLine(line, textRight, top + 8 + lineIndex * 54, 54, unpricedStyle, 'end');
      });
      return;
    }
    const amountStyle: TextStyle = { fontSize: 80, fontWeight: 700, letterSpacingEm: -0.04 };
    svg += textLine(words.inDisplayCurrency, textRight, top + 2, 84, { ...amountStyle, fontSize: Math.max(smallestFontSize, largestFontSizeThatFits(words.inDisplayCurrency, amountStyle, 470)) }, 'end');
    const difference = row.placePrice.kind === 'priced' && !row.roles.includes('visitor') ? differenceFromVisitorWords(comparison, row.placePrice.price, null) : '';
    const smallPrint = [words.inLocalCurrency && `(${words.inLocalCurrency})`, difference, salesTaxLabel(row.placePrice) === 'Population-weighted average' ? 'population-weighted average' : ''].filter(Boolean).join(', ');
    if (smallPrint) svg += textLine(smallPrint, textRight, top + 84, 52, softStyle(smallestFontSize), 'end');
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${shareCardWidth}" height="${shareCardHeight}" viewBox="0 0 ${shareCardWidth} ${shareCardHeight}">
<rect width="${shareCardWidth}" height="${shareCardHeight}" fill="${paperColour}"/>
<rect x="${tileLeft}" y="${tileTop}" width="${tileSize}" height="${tileSize}" rx="40" fill="${photoTileColour}"/>
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
