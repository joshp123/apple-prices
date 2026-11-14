// assets/product-photos.json, written by tools/measure-product-photos.ts.
import measuredProductPhotos from '../assets/product-photos.json' with { type: 'json' };

export type ProductPhoto = {
  imageName: string;
  // Left, top, right and bottom of the product on Apple's square canvas of productPhotoPixels.
  productBox: [number, number, number, number];
  onOpaqueBackdrop: boolean;
};
export type ProductPhotos = Record<string, { usualPhoto: ProductPhoto; photoByConfigurationId: Record<string, ProductPhoto> }>;

export const appleImageServer = 'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/';
export const productPhotoPixels = 800;
// The copies in assets/product-photos for the share card: Apple's whole canvas, small, on the card's paper colour.
export const shareCardPhotoPixels = 560;
export const shareCardPaperColour = '#fbfbfd';

// Apple's server draws the photo at any size asked for; the product box is always measured on the full canvas of productPhotoPixels.
export function productPhotoUrl(photo: ProductPhoto, pixels: number): string {
  return `${appleImageServer}${photo.imageName}?wid=${pixels}&hei=${pixels}&fmt=png-alpha`;
}

// JSON cannot say that a product box is exactly four numbers.
const productPhotos = measuredProductPhotos as unknown as ProductPhotos;

export function productPhotoFor(productId: string, configurationId: string): ProductPhoto {
  const photos = productPhotos[productId];
  return photos.photoByConfigurationId[configurationId] ?? photos.usualPhoto;
}
