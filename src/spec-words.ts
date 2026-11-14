import type { Product, ProductConfiguration, ProductSpecs } from './generated/apple_prices/v1/price_snapshot_pb.js';

export type SpecName = Exclude<keyof ProductSpecs, '$typeName' | '$unknown'>;

// The order Apple's own shop asks in: size first, then what is inside, then the extras.
export const specNamesInShopOrder: SpecName[] = ['screenSizeInches', 'caseSizeMillimetres', 'caseMaterial', 'chip', 'cpuCoreCount', 'gpuCoreCount', 'memoryGigabytes', 'storageGigabytes', 'connectivity', 'displayGlass', 'stand', 'chargingCase', 'packQuantity'];

const specTitles: Record<SpecName, string> = {
  screenSizeInches: 'Screen', chip: 'Chip', cpuCoreCount: 'CPU', gpuCoreCount: 'Graphics', memoryGigabytes: 'Memory', storageGigabytes: 'Storage', connectivity: 'Connectivity',
  displayGlass: 'Glass', stand: 'Stand', caseMaterial: 'Case', caseSizeMillimetres: 'Case size', packQuantity: 'Pack', chargingCase: 'Charging case',
};
export const specTitle = (specName: SpecName) => specTitles[specName];

// Apple counts storage in decimal: 1TB is 1000GB.
export const storageWords = (gigabytes: number) => (gigabytes >= 1000 ? `${gigabytes / 1000}TB` : `${gigabytes}GB`);
const packWords = (quantity: number) => (quantity === 1 ? 'One' : `Pack of ${quantity}`);

export function specValueWords(specName: SpecName, value: string | number): string {
  switch (specName) {
    case 'screenSizeInches': return `${value}-inch`;
    case 'cpuCoreCount': return `${value}-core CPU`;
    case 'gpuCoreCount': return `${value}-core GPU`;
    case 'memoryGigabytes': return `${value}GB memory`;
    case 'storageGigabytes': return storageWords(Number(value));
    case 'caseSizeMillimetres': return `${value}mm`;
    case 'packQuantity': return packWords(Number(value));
    default: return String(value);
  }
}

export function specNamesThatVary(product: Product): SpecName[] {
  return specNamesInShopOrder.filter(specName => new Set(product.configurations.map(configuration => configuration.specs![specName])).size > 1);
}

// The specs that make a price comparable: size, chip and cores, memory, storage, then whatever else tells this configuration from the others.
export function specParts(product: Product, configuration: ProductConfiguration): string[] {
  const specs = configuration.specs!, varying = specNamesThatVary(product), parts: string[] = [];
  if (specs.caseSizeMillimetres) parts.push(`${specs.caseSizeMillimetres}mm${specs.caseMaterial ? ` ${specs.caseMaterial.toLowerCase()}` : ''}`);
  if (specs.screenSizeInches) parts.push(`${specs.screenSizeInches}-inch`);
  if (specs.chip) parts.push(specs.cpuCoreCount ? `${specs.chip} (${specs.cpuCoreCount}-core CPU, ${specs.gpuCoreCount}-core GPU)` : specs.chip);
  if (specs.memoryGigabytes) parts.push(`${specs.memoryGigabytes}GB memory`);
  if (specs.storageGigabytes) parts.push(storageWords(specs.storageGigabytes) + (specs.memoryGigabytes ? ' storage' : ''));
  if (specs.connectivity) parts.push(specs.connectivity);
  for (const specName of ['displayGlass', 'stand', 'chargingCase'] as const) if (specs[specName] && varying.includes(specName)) parts.push(specs[specName]);
  if (specs.packQuantity) parts.push(packWords(specs.packQuantity));
  return parts;
}

export const specLine = (product: Product, configuration: ProductConfiguration) => specParts(product, configuration).join(', ');

// "iPhone 18 Pro 256GB": enough to tell which configuration a map key or a sentence is about.
export function productNameWithStorage(product: Product, configuration: ProductConfiguration): string {
  const specs = configuration.specs!;
  return specs.storageGigabytes && !specs.memoryGigabytes ? `${product.productName} ${storageWords(specs.storageGigabytes)}` : product.productName;
}
