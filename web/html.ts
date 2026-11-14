// Small pieces of HTML every part of the page uses.
import { countryCodeOf, isStateOrProvince } from '../src/places.ts';
import { productPhotoPixels, productPhotoUrl, type ProductPhoto } from '../src/product-photos.ts';

export const escapeHtml = (text: string) => text.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]!);

// Filled in by hosting/build.mjs: the address of every flag file, which changes when the file does.
declare const FLAG_PATHS: Record<string, string>;
const flagPaths = FLAG_PATHS;

// A state or province is its country's flag with its own flag over the lower right corner.
export function flagHtml(placeCode: string, sizeClass = ''): string {
  const countryFlagPath = flagPaths[countryCodeOf(placeCode)];
  if (!countryFlagPath) return `<span class="flag flag-unknown ${sizeClass}"></span>`;
  const cornerFlag = isStateOrProvince(placeCode) ? `<img class="flag-of-state-or-province" src="${flagPaths[placeCode]}" alt="">` : '';
  return `<span class="flag ${sizeClass}"><img src="${countryFlagPath}" alt="">${cornerFlag}</span>`;
}

// Apple's photo, cropped to the product inside its square canvas.
export function productPhotoHtml(photo: ProductPhoto, boxPixels: number): string {
  const [left, top, right, bottom] = photo.productBox;
  const scale = boxPixels / Math.max(right - left, bottom - top);
  const loadedPixels = Math.min(productPhotoPixels, Math.ceil(productPhotoPixels * scale * 2 / 100) * 100);
  return `<span class="product-photo" style="width:${boxPixels}px;height:${boxPixels}px"><span class="product-photo-crop" style="width:${(right - left) * scale}px;height:${(bottom - top) * scale}px">`
    + `<img src="${productPhotoUrl(photo, loadedPixels)}" alt="" width="${productPhotoPixels * scale}" height="${productPhotoPixels * scale}" style="transform:translate(${-left * scale}px,${-top * scale}px)"></span></span>`;
}

const icon = (path: string) => `<svg class="icon" viewBox="0 0 12 12" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const icons = {
  close: icon('m2.5 2.5 7 7m0-7-7 7'),
  plus: icon('M6 2v8M2 6h8'),
  minus: icon('M2 6h8'),
  share: icon('M6 7.5v-6m0 0L3.8 3.7M6 1.5l2.2 2.2M2.5 6.5v3a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-3'),
  locate: icon('M10.5 1.5 1.5 5.3l3.7 1.5 1.5 3.7z'),
};
