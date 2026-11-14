// The colour of a price on the map and the price line: green where it is cheapest, through yellow and orange to dark red,
// by how much more it costs than the cheapest place. Lightness only ever falls, so the order survives colour blindness.
type ColourStop = { shareMoreThanCheapest: number; lightness: number; chroma: number; hueDegrees: number };
const colourStops: ColourStop[] = [
  { shareMoreThanCheapest: 0, lightness: 0.87, chroma: 0.15, hueDegrees: 150 },
  { shareMoreThanCheapest: 0.12, lightness: 0.87, chroma: 0.16, hueDegrees: 128 },
  { shareMoreThanCheapest: 0.3, lightness: 0.85, chroma: 0.165, hueDegrees: 98 },
  { shareMoreThanCheapest: 0.5, lightness: 0.76, chroma: 0.17, hueDegrees: 68 },
  { shareMoreThanCheapest: 0.8, lightness: 0.64, chroma: 0.2, hueDegrees: 40 },
  { shareMoreThanCheapest: 1.2, lightness: 0.5, chroma: 0.19, hueDegrees: 28 },
  { shareMoreThanCheapest: 1.6, lightness: 0.4, chroma: 0.15, hueDegrees: 24 },
];

// OKLCH to an sRGB hex colour, which the share card's SVG renderer understands.
function hexColourFromOklch(lightness: number, chroma: number, hueDegrees: number): string {
  const a = chroma * Math.cos(hueDegrees * Math.PI / 180), b = chroma * Math.sin(hueDegrees * Math.PI / 180);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linearChannels = [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
  return `#${linearChannels.map(linear => {
    const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, encoded)) * 255).toString(16).padStart(2, '0');
  }).join('')}`;
}

export function priceColour(priceInUsDollars: number, cheapestPriceInUsDollars: number): string {
  const shareMore = Math.max(0, priceInUsDollars / cheapestPriceInUsDollars - 1);
  const nextStop = colourStops.findIndex(stop => stop.shareMoreThanCheapest >= shareMore);
  if (nextStop <= 0) {
    const stop = colourStops[nextStop === 0 ? 0 : colourStops.length - 1];
    return hexColourFromOklch(stop.lightness, stop.chroma, stop.hueDegrees);
  }
  const from = colourStops[nextStop - 1], to = colourStops[nextStop];
  const shareOfWay = (shareMore - from.shareMoreThanCheapest) / (to.shareMoreThanCheapest - from.shareMoreThanCheapest);
  const between = (start: number, end: number) => start + (end - start) * shareOfWay;
  return hexColourFromOklch(between(from.lightness, to.lightness), between(from.chroma, to.chroma), between(from.hueDegrees, to.hueDegrees));
}
