// The two share cards as SVGs of text, rectangles and images, which the Worker turns into PNGs with resvg.
// Most people meet the site as one of these in a phone's Twitter timeline, at a fifth or a sixth of its size, so the type is that much
// larger than it looks: 50 pixels here is 8 points there.
import interAdvanceWidths from '../assets/fonts/inter-advance-widths.json' with { type: 'json' };
import { countryCodeOf, isStateOrProvince, placeName } from './places.ts';
import { priceWords, unpricedWordsOnShareCard, type ComparisonColumn, type ComparisonRole, type PriceComparison } from './price-comparison.ts';
import { priceColour } from './price-colour.ts';
import { productPhotoPixels, shareCardPaperColour, type ProductPhoto } from './product-photos.ts';
import { specNamesThatVary, storageWords } from './spec-words.ts';

export type ShareCardPictures = {
  productPhoto: ProductPhoto;
  productPhotoDataUrl: string;
  // A country's flag by its code ("NL"), a state's or province's own flag by its code ("US-CA").
  flagDataUrls: Record<string, string>;
};

const sideMargin = 72;
const photoShareOfTile = 0.86;
const paperColour = shareCardPaperColour, inkColour = '#1d1d1f', softInkColour = '#5f5f67', photoTileColour = '#f1f1f4';

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

const withSize = (style: TextStyle, fontSize: number): TextStyle => ({ ...style, fontSize });
const fitted = (text: string, style: TextStyle, widthLimit: number, smallestFontSize: number) => withSize(style, Math.max(smallestFontSize, largestFontSizeThatFits(text, style, widthLimit)));
function textOnBaseline(text: string, x: number, baseline: number, style: TextStyle, anchor: TextAnchor = 'start'): string {
  return textLine(text, x, baseline - style.fontSize * interCapitalHeightEm, style.fontSize * interCapitalHeightEm, style, anchor);
}

// The grey tile that holds Apple's photo. Every product gets the same tile, whether Apple shot it on white, on grey or cut out.
function photoTile(pictures: ShareCardPictures, left: number, top: number, width: number, height: number, photoAboveMiddle = 0): string {
  const [productLeft, productTop, productRight, productBottom] = pictures.productPhoto.productBox;
  // productPhoto fits the product into a square, so the square is as large as lets the product fill the tile to its margin.
  const productWidth = productRight - productLeft, productHeight = productBottom - productTop, longerSide = Math.max(productWidth, productHeight);
  const photoSize = Math.min(width * photoShareOfTile * longerSide / productWidth, (height - photoAboveMiddle * 2) * photoShareOfTile * longerSide / productHeight);
  return `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${Math.min(width, height) / 12}" fill="${photoTileColour}"/>`
    + productPhoto(pictures, left + (width - photoSize) / 2, top + (height - photoSize) / 2 - photoAboveMiddle, photoSize);
}

// The two halves of a sentence too long for one line, as near the same width as the two widths allow, or nothing when it cannot fit.
function twoLines(text: string, style: TextStyle, firstWidthLimit: number, secondWidthLimit: number): [string, string] | null {
  const words = text.split(' ');
  let best: [string, string] | null = null, bestDifference = Infinity;
  for (let wordCount = 1; wordCount < words.length; wordCount++) {
    const first = words.slice(0, wordCount).join(' '), second = words.slice(wordCount).join(' ');
    const firstWidth = textWidth(first, style), secondWidth = textWidth(second, style);
    if (firstWidth > firstWidthLimit || secondWidth > secondWidthLimit || Math.abs(firstWidth - secondWidth) >= bestDifference) continue;
    best = [first, second];
    bestDifference = Math.abs(firstWidth - secondWidth);
  }
  return best;
}

// One row's words, before any are placed.
type RowWords = { row: CardRow; role: string; name: string; price: string; isRange: boolean; localMoney: string; unpriced: string };

function rowWords(comparison: PriceComparison, row: CardRow): RowWords {
  const words = priceWords(comparison, row.placePrice, { shortenMillions: true });
  return {
    row, role: rolesWords(row.roles), name: placeName(comparison.snapshot, row.placeCode),
    price: words?.inDisplayCurrency ?? '', isRange: row.placePrice.kind === 'priced-by-state-or-province', localMoney: words?.inLocalCurrency ? `(${words.inLocalCurrency})` : '',
    unpriced: words ? '' : unpricedWordsOnShareCard(row.placePrice),
  };
}

// The rows are the card: one per place, each the same. The flag stands at the left, as tall as the two lines beside it: what the
// place is to me, then its name. The price stands at the right, the largest thing on the card, behind a dot of the colour the place
// has on the site's map, with the price in the place's own money in brackets under it.
// The type grows with the height a row gets, so a card with three places is set larger than a card with four. Every name is one
// size and every price is one size: the largest at which the longest still fits. Only a range of prices (the United States with no
// state) is set smaller than the others, because it is two prices long.
type RowsBox = { left: number; right: number; top: number; bottom: number };
const rowHeightAtFullSize = 200;
const fullPriceSize = 112, fullNameSize = 82, fullSmallSize = 50, fullFlagHeight = 108;
const priceStyle: TextStyle = { fontSize: fullPriceSize, fontWeight: 700, letterSpacingEm: -0.035 };
const nameStyle: TextStyle = { fontSize: fullNameSize, fontWeight: 700, letterSpacingEm: -0.025 };
const smallStyle: TextStyle = { fontSize: fullSmallSize, fontWeight: 400, letterSpacingEm: -0.01, colour: softInkColour };
const dotRadiusEm = 0.17, dotGapEm = 0.2, dotWidthEm = dotRadiusEm * 2 + dotGapEm;

function placeRows(comparison: PriceComparison, pictures: ShareCardPictures, box: RowsBox, largestScale: number, smallestSmallSize: number): string {
  const rows = cardRows(comparison).map(row => rowWords(comparison, row));
  const rowHeight = (box.bottom - box.top) / rows.length, scale = Math.min(largestScale, rowHeight / rowHeightAtFullSize);
  const small = withSize(smallStyle, Math.max(smallestSmallSize, Math.round(fullSmallSize * scale)));
  const flagHeight = fullFlagHeight * scale, flagWidth = flagHeight * 1.5, columnGap = small.fontSize * 0.8;
  const textLeft = box.left + flagWidth + flagHeight * 0.3, textWidthLimit = box.right - textLeft;
  const fullPrice = withSize(priceStyle, fullPriceSize * scale), fullName = withSize(nameStyle, fullNameSize * scale);

  // The name and the role share the width with whatever stands at the right. A name gives way to a price, down to the small size.
  // A range of prices and a reason for no price are long, so they give way too, and leave the name four fifths of its size.
  const widthWithDot = (text: string, style: TextStyle) => textWidth(text, style) + style.fontSize * dotWidthEm;
  const narrowestName = (row: RowWords) => textWidth(row.name, row.price && !row.isRange ? withSize(nameStyle, small.fontSize) : withSize(nameStyle, fullName.fontSize * 0.8));
  const priceLimit = (row: RowWords) => textWidthLimit - columnGap - Math.max(textWidth(row.role, small), narrowestName(row));
  const priceFitted = (row: RowWords, style: TextStyle) => withSize(style, Math.max(small.fontSize, Math.min(style.fontSize, Math.floor(style.fontSize * priceLimit(row) / widthWithDot(row.price, style)))));
  const priceAt = withSize(priceStyle, Math.min(fullPrice.fontSize, ...rows.filter(row => row.price && !row.isRange).map(row => priceFitted(row, fullPrice).fontSize)));
  // A place with no price says why where its price would be, on two lines when one is too long, at the largest size at which that fits.
  const reasonOf = (row: RowWords): { lines: string[]; style: TextStyle } => {
    for (let fontSize = small.fontSize; ; fontSize -= 2) {
      const style: TextStyle = { ...small, fontSize, fontWeight: 600, colour: inkColour };
      const lines = textWidth(row.unpriced, style) <= priceLimit(row) ? [row.unpriced] : twoLines(row.unpriced, style, priceLimit(row), priceLimit(row));
      if (lines || fontSize <= small.fontSize / 2) return { lines: lines ?? [row.unpriced], style };
    }
  };
  const rightWidth = (row: RowWords) => (row.price
    ? Math.max(widthWithDot(row.price, row.isRange ? priceFitted(row, priceAt) : priceAt), textWidth(row.localMoney, small))
    : Math.max(...reasonOf(row).lines.map(line => textWidth(line, reasonOf(row).style))));
  const nameAt = withSize(nameStyle, Math.min(...rows.map(row => fitted(row.name, fullName, textWidthLimit - columnGap - rightWidth(row), small.fontSize).fontSize)));

  const capitals = (style: TextStyle) => style.fontSize * interCapitalHeightEm;
  const leftGap = 26 * scale, leftHeight = capitals(small) + leftGap + capitals(fullName);
  const cheapestInUsDollars = comparison.cheapest[0].amountInUsDollars;
  let svg = '';
  rows.forEach((row, index) => {
    const top = box.top + index * rowHeight, middle = top + rowHeight / 2, leftTop = middle - leftHeight / 2;
    if (index) svg += `<rect x="${box.left}" y="${(top - 1).toFixed(1)}" width="${box.right - box.left}" height="2" fill="${inkColour}" fill-opacity="0.1"/>`;
    svg += flag(pictures, row.row.placeCode, box.left, middle - flagHeight / 2, flagHeight);
    svg += textOnBaseline(row.role, textLeft, leftTop + capitals(small), small) + textOnBaseline(row.name, textLeft, leftTop + leftHeight, nameAt);
    const { placePrice } = row.row;
    if (placePrice.kind === 'priced' || placePrice.kind === 'priced-by-state-or-province') {
      const price = row.isRange ? priceFitted(row, priceAt) : priceAt, rightGap = 36 * scale;
      const rightHeight = capitals(price) + (row.localMoney ? rightGap + capitals(small) : 0), priceBaseline = middle - rightHeight / 2 + capitals(price);
      const lowest = placePrice.kind === 'priced' ? placePrice.price : placePrice.lowest;
      svg += textOnBaseline(row.price, box.right, priceBaseline, price, 'end');
      svg += `<circle cx="${(box.right - textWidth(row.price, price) - price.fontSize * (dotGapEm + dotRadiusEm)).toFixed(1)}" cy="${(priceBaseline - capitals(price) / 2).toFixed(1)}" r="${(price.fontSize * dotRadiusEm).toFixed(1)}" fill="${priceColour(lowest.amountInUsDollars, cheapestInUsDollars)}"/>`;
      if (row.localMoney) svg += textOnBaseline(row.localMoney, box.right, priceBaseline + rightGap + capitals(small), small, 'end');
    } else {
      const { lines, style } = reasonOf(row), lineStep = style.fontSize * 1.25, firstBaseline = middle + capitals(style) / 2 - (lines.length - 1) * lineStep / 2;
      lines.forEach((line, lineIndex) => { svg += textOnBaseline(line, box.right, firstBaseline + lineIndex * lineStep, style, 'end'); });
    }
  });
  return svg;
}

const cardSvg = (width: number, height: number, drawn: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${paperColour}"/>
${drawn}
</svg>`;

const siteAddressWords = 'appleprices.jjpcodes.com', madeByWords = 'slopped up by @jjpcodes';

// The card's heading is the product's name without what Apple puts in brackets after it: "MacBook Pro", not
// "MacBook Pro (Liquid Retina XDR)", so the name stays large. The bracketed words join the specs. The page keeps the whole name.
function headingAndDesignation(productName: string): { heading: string; designation: string } {
  const [, heading, designation] = productName.match(/^(.*) \((.*)\)$/) ?? [];
  return heading ? { heading, designation } : { heading: productName, designation: '' };
}

// The same specs the page gives, in fewer letters: what makes the price comparable first, then the display and the extras.
function cardSpecParts(product: PriceComparison['product'], configuration: PriceComparison['configuration']): string[] {
  const specs = configuration.specs!, varying = specNamesThatVary(product), parts: string[] = [];
  if (specs.caseSizeMillimetres) parts.push(`${specs.caseSizeMillimetres}mm${specs.caseMaterial ? ` ${specs.caseMaterial.toLowerCase()}` : ''}`);
  if (specs.screenSizeInches) parts.push(`${specs.screenSizeInches}-inch`);
  if (specs.chip) parts.push(specs.chip);
  if (specs.cpuCoreCount && specs.cpuCoreCount === specs.gpuCoreCount) parts.push(`${specs.cpuCoreCount}-core CPU/GPU`);
  else {
    if (specs.cpuCoreCount) parts.push(`${specs.cpuCoreCount}-core CPU`);
    if (specs.gpuCoreCount) parts.push(`${specs.gpuCoreCount}-core GPU`);
  }
  if (specs.memoryGigabytes) parts.push(`${specs.memoryGigabytes}GB RAM`);
  if (specs.storageGigabytes) parts.push(storageWords(specs.storageGigabytes));
  if (specs.connectivity) parts.push(specs.connectivity);
  const { designation } = headingAndDesignation(product.productName);
  if (designation) parts.push(designation);
  for (const specName of ['displayGlass', 'stand', 'chargingCase'] as const) if (specs[specName] && varying.includes(specName)) parts.push(specs[specName]);
  if (specs.packQuantity) parts.push(specs.packQuantity === 1 ? 'One' : `Pack of ${specs.packQuantity}`);
  return parts;
}

// Specs with a dot between them, on as many lines as they need; a line never ends inside a spec.
const betweenSpecs = ' · ';
function specLines(parts: string[], style: TextStyle, widthLimitOfLine: (lineIndex: number) => number): string[] {
  const lines: string[] = [];
  for (const part of parts) {
    const longerLine = lines.length ? lines[lines.length - 1] + betweenSpecs + part : part;
    if (lines.length && textWidth(longerLine, style) <= widthLimitOfLine(lines.length - 1)) lines[lines.length - 1] = longerLine;
    else lines.push(part);
  }
  // A last line of one spec takes the spec before it for company, when the two fit.
  const lastLine = lines[lines.length - 1], lineBefore = lines[lines.length - 2]?.split(betweenSpecs);
  if (lineBefore && lineBefore.length > 1 && !lastLine.includes(betweenSpecs)) {
    const together = lineBefore[lineBefore.length - 1] + betweenSpecs + lastLine;
    if (textWidth(together, style) <= widthLimitOfLine(lines.length - 1)) lines.splice(-2, 2, lineBefore.slice(0, -1).join(betweenSpecs), together);
  }
  return lines;
}

// What every price on the card is: its currency, and that tax is in it.
const pricesAreWords = (comparison: PriceComparison) => `${comparison.selection.displayCurrencyCode}${betweenSpecs}${comparison.selection.pricesIncludeTax ? 'Tax included' : 'Before tax'}`;

// The picture attached to a post, the one Copy picture and Save picture give. It is 20:17, the widest shape Twitter's carousel of
// pictures shows whole, and Twitter shows it whole on its own too. A phone shows it about 260 points wide, a sixth of its size.
// The product, its specs and its photo share the top, with what the prices are on the line above the rows. The rows take the whole
// width below, so the longest place name and the largest price both fit at full size. With fewer rows the photo grows.
export const postPictureWidth = 1600, postPictureHeight = 1360;
const postTop = 64, postFooterBaseline = postPictureHeight - 60, postRowsBottom = postFooterBaseline - 84, gapAbovePostRows = 28;
const largestPostRowScale = 1.25, smallestPostTile = 356, largestPostTile = 600, widestPostTile = 560, gapBesidePostTile = 56;
const postTitleStyle: TextStyle = { fontSize: 104, fontWeight: 700, letterSpacingEm: -0.035 };
const postSpecStyle: TextStyle = { fontSize: 52, fontWeight: 400, letterSpacingEm: -0.01, colour: softInkColour };
const pricesAreStyle: TextStyle = { fontSize: 46, fontWeight: 600, letterSpacingEm: -0.005, colour: softInkColour };
const postTitleLine = 108, postSpecLine = 60, postPricesAreLine = 52;

export function postPictureSvg(comparison: PriceComparison, pictures: ShareCardPictures): string {
  const { product, configuration } = comparison;
  const right = postPictureWidth - sideMargin, rowCount = cardRows(comparison).length;
  const tileSize = Math.max(smallestPostTile, Math.min(largestPostTile, postRowsBottom - postTop - gapAbovePostRows - rowCount * rowHeightAtFullSize * largestPostRowScale));
  const tileWidth = Math.min(widestPostTile, tileSize * 1.3);
  const rowsTop = postTop + tileSize + gapAbovePostRows, titleWidthLimit = right - sideMargin - tileWidth - gapBesidePostTile;
  const { heading } = headingAndDesignation(product.productName);
  const title = fitted(heading, postTitleStyle, titleWidthLimit, 64);
  const specs = specLines(cardSpecParts(product, configuration), postSpecStyle, () => titleWidthLimit);
  // The name and specs stand in the middle of the height the photo has above the last line, which says what the prices are.
  const titleTop = postTop + (tileSize - postPricesAreLine - postTitleLine - specs.length * postSpecLine) / 2;

  let svg = photoTile(pictures, right - tileWidth, postTop, tileWidth, tileSize);
  svg += textLine(heading, sideMargin, titleTop, postTitleLine, title);
  specs.forEach((line, index) => { svg += textLine(line, sideMargin, titleTop + postTitleLine + index * postSpecLine, postSpecLine, postSpecStyle); });
  svg += textOnBaseline(pricesAreWords(comparison), sideMargin, postTop + tileSize - 4, pricesAreStyle);
  svg += placeRows(comparison, pictures, { left: sideMargin, right, top: rowsTop, bottom: postRowsBottom }, largestPostRowScale, 50);
  svg += textOnBaseline(siteAddressWords, sideMargin, postFooterBaseline, { fontSize: 54, fontWeight: 600, letterSpacingEm: -0.02 });
  svg += textOnBaseline(madeByWords, right, postFooterBaseline, { fontSize: 50, fontWeight: 400, letterSpacingEm: -0.015, colour: softInkColour }, 'end');
  return cardSvg(postPictureWidth, postPictureHeight, svg);
}

// The picture Twitter shows when someone posts the bare link. It is 2:1 and a phone shows it about 340 points wide, a fifth of its
// size. Twitter may trim it to 1.91:1, so the sides keep a wide margin, and it lays the page's title over the bottom left corner,
// about a third of the width and the lowest fifth of the height on a phone. The photo's tile is there, as narrow as that title,
// with the photo raised a little. The site's address is at the top, where nothing covers it, and what the prices are stands
// above them.
export const shareCardWidth = 1800, shareCardHeight = 900;
const previewTop = 44, previewBottom = shareCardHeight - 48, previewTileWidth = 432, gapBesidePreviewTile = 56, gapBelowPreviewSpecs = 22;
const previewTitleStyle: TextStyle = { fontSize: 76, fontWeight: 700, letterSpacingEm: -0.035 };
const previewSpecStyle: TextStyle = { fontSize: 44, fontWeight: 400, letterSpacingEm: -0.01, colour: softInkColour };
const previewTitleLine = 84, previewSpecLine = 54;

export function shareCardSvg(comparison: PriceComparison, pictures: ShareCardPictures): string {
  const { product, configuration } = comparison;
  const right = shareCardWidth - sideMargin, fullWidth = right - sideMargin;
  const address: TextStyle = { fontSize: 44, fontWeight: 600, letterSpacingEm: -0.02 }, madeBy: TextStyle = { ...previewSpecStyle, letterSpacingEm: -0.015 };
  const { heading } = headingAndDesignation(product.productName), pricesAre = withSize(pricesAreStyle, 42);
  const title = fitted(heading, previewTitleStyle, fullWidth - textWidth(siteAddressWords, address) - 48, 56);
  // The right of the three lines at the top: the address, "slopped up by @jjpcodes", and what the prices are. The specs wrap clear of them.
  const rightOfLine = [madeByWords, pricesAreWords(comparison)], rightStyles = [madeBy, pricesAre];
  const specs = specLines(cardSpecParts(product, configuration), previewSpecStyle, lineIndex => fullWidth - (rightOfLine[lineIndex] ? textWidth(rightOfLine[lineIndex], rightStyles[lineIndex]) + 48 : 0));
  const linesBelowTitle = Math.max(specs.length, rightOfLine.length);
  const bodyTop = previewTop + previewTitleLine + linesBelowTitle * previewSpecLine + gapBelowPreviewSpecs, tileHeight = previewBottom - bodyTop;
  const titleBaseline = previewTop + (previewTitleLine + previewTitleStyle.fontSize * interCapitalHeightEm) / 2;

  let svg = textOnBaseline(heading, sideMargin, titleBaseline, title) + textOnBaseline(siteAddressWords, right, titleBaseline, address, 'end');
  specs.forEach((line, index) => { svg += textLine(line, sideMargin, previewTop + previewTitleLine + index * previewSpecLine, previewSpecLine, previewSpecStyle); });
  rightOfLine.forEach((line, index) => { svg += textLine(line, right, previewTop + previewTitleLine + index * previewSpecLine, previewSpecLine, rightStyles[index], 'end'); });
  svg += photoTile(pictures, sideMargin, bodyTop, previewTileWidth, tileHeight, tileHeight * 0.08);
  svg += placeRows(comparison, pictures, { left: sideMargin + previewTileWidth + gapBesidePreviewTile, right, top: bodyTop, bottom: previewBottom }, 1, 44);
  return cardSvg(shareCardWidth, shareCardHeight, svg);
}

// The place codes whose flags the card for this comparison needs: each named place's country, and the place itself where it is a state or province.
export function flagCodesOnShareCard(comparison: PriceComparison): string[] {
  return [...new Set(comparison.columns.flatMap(column => [countryCodeOf(column.placeCode), column.placeCode]))];
}
