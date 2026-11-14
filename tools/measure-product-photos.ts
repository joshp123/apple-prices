// Writes assets/product-photos.json: which Apple photo shows each product and configuration, and where the product sits in it.
// Apple's photos are 800 by 800 with a lot of empty space, and some sit on an opaque backdrop; the page and the share card crop to the product.
// Also writes assets/product-photos/: each photo small, on the share card's paper colour, because the Worker that draws the card
// cannot count on Apple's image server answering it.
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { fromBinary } from '@bufbuild/protobuf';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PriceSnapshotSchema, type ProductSpecs } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { appleImageServer, productPhotoPixels, shareCardPaperColour, shareCardPhotoPixels, type ProductPhoto, type ProductPhotos } from '../src/product-photos.ts';

type PhotoForSpecs = { whenSpecs: Partial<ProductSpecs>; imageName: string };

// Apple's own photo of the product as configured, where the store page's photo shows something else:
// three watches at once, a yellow backdrop, or the smaller screen size.
const betterProductPhotoNames: Record<string, string> = {
  imac: 'imac-color-unselect-202610-gallery-1',
  'apple-watch-series-12': 'watch-compare-series-12-202609',
  'apple-watch-se-3': 'watch-compare-se-3-202609',
  'apple-watch-ultra-4': 'watch-compare-ultra-4-202609',
};
const photosForConfigurations: Record<string, PhotoForSpecs[]> = {
  'ipad-pro': [{ whenSpecs: { screenSizeInches: 13 }, imageName: 'ipad-pro-13-select-wifi-spaceblack-202405' }],
  'ipad-air': [{ whenSpecs: { screenSizeInches: 13 }, imageName: 'ipad-air-select-13in-wifi-spacegray-202405' }],
  'macbook-air': [{ whenSpecs: { screenSizeInches: 15 }, imageName: 'macbook-air-specs-select-202601-15inch-starlight' }],
  'macbook-pro': [{ whenSpecs: { screenSizeInches: 16 }, imageName: 'mac-macbook-pro-specs-select-202610-16inch-spaceblack' }],
  'macbook-pro-proled-xdr': [{ whenSpecs: { screenSizeInches: 16 }, imageName: 'mac-macbook-pro-proled-specs-select-202610-16inch-spaceblack' }],
  airtag: [{ whenSpecs: { packQuantity: 4 }, imageName: 'airtag-4pack-select-202601' }],
  'apple-watch-series-12': [
    { whenSpecs: { caseMaterial: 'Titanium', caseSizeMillimetres: 42 }, imageName: 'watch-case-42-titanium-natural-cell-s12_VW_34FR' },
    { whenSpecs: { caseMaterial: 'Titanium', caseSizeMillimetres: 46 }, imageName: 'watch-case-46-titanium-natural-cell-s12_VW_34FR' },
    { whenSpecs: { caseMaterial: 'Ceramic', caseSizeMillimetres: 42 }, imageName: 'watch-case-42-ceramic-pearlwhite-cell-s12_VW_34FR' },
    { whenSpecs: { caseMaterial: 'Ceramic', caseSizeMillimetres: 46 }, imageName: 'watch-case-46-ceramic-pearlwhite-cell-s12_VW_34FR' },
  ],
};

await initWasm(await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
await mkdir('assets/product-photos', { recursive: true });

const measuredPhotos = new Map<string, ProductPhoto>();
async function measuredPhoto(imageName: string): Promise<ProductPhoto> {
  if (!measuredPhotos.has(imageName)) measuredPhotos.set(imageName, await measurePhoto(imageName));
  return measuredPhotos.get(imageName)!;
}

async function measurePhoto(imageName: string): Promise<ProductPhoto> {
  const size = productPhotoPixels;
  const response = await fetch(`${appleImageServer}${imageName}?wid=${size}&hei=${size}&fmt=png-alpha`);
  if (!response.ok) throw new Error(`Apple has no photo ${imageName}: ${response.status}`);
  const photoDataUrl = `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  const pixels = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image href="${photoDataUrl}" width="${size}" height="${size}"/></svg>`).render().pixels;
  const pixelAt = (x: number, y: number) => pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4);
  const isOpaque = (pixel: Uint8Array) => pixel[3] > 250;

  const boxAround = (isInside: (pixel: Uint8Array) => boolean, [fromLeft, fromTop, fromRight, fromBottom]: number[]): [number, number, number, number] => {
    let left = size, top = size, right = 0, bottom = 0;
    for (let y = fromTop; y < fromBottom; y++) {
      for (let x = fromLeft; x < fromRight; x++) {
        if (!isInside(pixelAt(x, y))) continue;
        left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
      }
    }
    return [left, top, right, bottom];
  };
  const paintedBox = boxAround(pixel => pixel[3] > 8, [0, 0, size, size]);
  const backdrop = pixelAt(paintedBox[0] + 2, paintedBox[1] + 2);
  const colourDifference = (pixel: Uint8Array, other: Uint8Array) => Math.abs(pixel[0] - other[0]) + Math.abs(pixel[1] - other[1]) + Math.abs(pixel[2] - other[2]);
  const otherCorners = [pixelAt(paintedBox[2] - 3, paintedBox[1] + 2), pixelAt(paintedBox[0] + 2, paintedBox[3] - 3), pixelAt(paintedBox[2] - 3, paintedBox[3] - 3)];
  const onOpaqueBackdrop = isOpaque(backdrop) && otherCorners.every(corner => isOpaque(corner) && colourDifference(backdrop, corner) < 8);
  const [left, top, right, bottom] = onOpaqueBackdrop ? boxAround(pixel => colourDifference(pixel, backdrop) > 24, paintedBox) : paintedBox;
  const smallPhoto = await fetch(`${appleImageServer}${imageName}?wid=${shareCardPhotoPixels}&hei=${shareCardPhotoPixels}&fmt=jpeg&qlt=85&bgc=0x${shareCardPaperColour.slice(1)}`);
  if (!smallPhoto.ok) throw new Error(`Apple has no small photo ${imageName}: ${smallPhoto.status}`);
  await writeFile(`assets/product-photos/${imageName}.jpg`, Buffer.from(await smallPhoto.arrayBuffer()));
  console.log(imageName.padEnd(64), onOpaqueBackdrop ? 'backdrop' : 'cut out ', [left, top, right, bottom].join(','));
  return { imageName, productBox: [left, top, right, bottom], onOpaqueBackdrop };
}

const snapshot = fromBinary(PriceSnapshotSchema, await readFile('data/price-snapshot.binpb'));
const productPhotos: ProductPhotos = {};
for (const product of snapshot.products) {
  const usualPhoto = await measuredPhoto(betterProductPhotoNames[product.productId] ?? product.appleImageUrl.split('/is/')[1]);
  const photoByConfigurationId: Record<string, ProductPhoto> = {};
  for (const configuration of product.configurations) {
    const match = (photosForConfigurations[product.productId] ?? []).find(({ whenSpecs }) => Object.entries(whenSpecs).every(([spec, value]) => configuration.specs![spec as keyof ProductSpecs] === value));
    if (match) photoByConfigurationId[configuration.configurationId] = await measuredPhoto(match.imageName);
  }
  productPhotos[product.productId] = { usualPhoto, photoByConfigurationId };
}
await writeFile('assets/product-photos.json', JSON.stringify(productPhotos, null, 1));
