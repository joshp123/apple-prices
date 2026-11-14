import { create } from '@bufbuild/protobuf';
import { ProductSpecsSchema, type ProductSpecs } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';
import { withPlainSpaces } from './apple-store-page.ts';

export type SpecFields = Partial<Omit<ProductSpecs, '$typeName'>>;

const dimensionsThatNeverChangeThePrice = new Set(['Color']);

const readableDimensionValues: Record<string, Record<string, SpecFields>> = {
  Connection: {
    wifi: { connectivity: 'Wi-Fi' },
    wificell: { connectivity: 'Wi-Fi + Cellular' },
    gps: { connectivity: 'GPS' },
    gpscell: { connectivity: 'GPS + Cellular' },
  },
  Finish: {
    glossy: { displayGlass: 'Standard glass' },
    matte: { displayGlass: 'Nano-texture glass' },
  },
  StandType: {
    vesa: { stand: 'VESA mount' },
    tiltadjuststand: { stand: 'Tilt-adjustable stand' },
    tiltheightadjuststand: { stand: 'Tilt- and height-adjustable stand' },
  },
  CaseMaterial: {
    aluminum: { caseMaterial: 'Aluminium' },
    titanium: { caseMaterial: 'Titanium' },
    ceramic: { caseMaterial: 'Ceramic' },
  },
  Charging: {
    usbc: { chargingCase: 'USB-C charging case' },
    wirelesscharging: { chargingCase: 'Wireless charging case' },
  },
  MerchModel: {
    homeview_standalone: { stand: 'Standalone' },
    homeview_wallmount: { stand: 'Wall mount' },
  },
};

function storageGigabytes(text: string): number {
  const match = /^(\d+)\s?(gb|tb)$/i.exec(text.trim());
  if (!match) throw new Error(`Unrecognised storage "${text}"`);
  return Number(match[1]) * (match[2].toLowerCase() === 'tb' ? 1000 : 1);
}

export function specsFromVariantDimensions(dimensions: Record<string, string>, fixedSpecs: SpecFields = {}): ProductSpecs {
  const fields: SpecFields = { ...fixedSpecs };
  for (const [dimension, value] of Object.entries(dimensions)) {
    if (dimensionsThatNeverChangeThePrice.has(dimension)) continue;
    if (dimension === 'Capacity') fields.storageGigabytes = storageGigabytes(value);
    else if (dimension === 'Screensize') fields.screenSizeInches = Number(value.replace('inch', '').replace('_', '.'));
    else if (dimension === 'CaseSize') fields.caseSizeMillimetres = Number(value.replace('mm', ''));
    else if (dimension === 'PackQty') fields.packQuantity = Number(value.replace('pack', ''));
    else {
      const readable = readableDimensionValues[dimension]?.[value];
      if (!readable) throw new Error(`Unrecognised dimension ${dimension}=${value}; add it to readableDimensionValues`);
      Object.assign(fields, readable);
    }
  }
  return create(ProductSpecsSchema, fields);
}

const macSpecsEveryConfigurationHas = ['chip', 'cpuCoreCount', 'gpuCoreCount', 'memoryGigabytes', 'storageGigabytes'] as const;

function completeMacSpecs(fields: SpecFields, name: string): ProductSpecs {
  const missing = macSpecsEveryConfigurationHas.filter(field => !fields[field]);
  if (missing.length) throw new Error(`Mac "${name}" has no ${missing.join(', ')}; add them to the catalogue's fixedSpecs`);
  return create(ProductSpecsSchema, fields);
}

// Apple's English product names, e.g. "MacBook Air, 13-inch, M5 Chip, 10-core CPU, 10-core GPU, Midnight, 16GB memory, 1TB storage".
export function specsFromMacProductName(appleName: string, fixedSpecs: SpecFields = {}): ProductSpecs {
  const name = withPlainSpaces(appleName);
  const fields: SpecFields = { ...fixedSpecs };
  const chip = /\b(M\d+(?: Pro| Max| Ultra)?|A\d+(?: Pro)?) Chip\b/i.exec(name);
  if (chip) fields.chip = chip[1];
  const screen = /(\d+(?:\.\d+)?)-inch/.exec(name);
  if (screen) fields.screenSizeInches = Number(screen[1]);
  const cpu = /(\d+)-core CPU/i.exec(name);
  if (cpu) fields.cpuCoreCount = Number(cpu[1]);
  const gpu = /(\d+)-core GPU/i.exec(name);
  if (gpu) fields.gpuCoreCount = Number(gpu[1]);
  const memory = /(\d+)GB (?:unified )?memory/i.exec(name);
  if (memory) fields.memoryGigabytes = Number(memory[1]);
  const storage = /(\d+\s?(?:GB|TB))(?: SSD)? storage/i.exec(name) ?? /(\d+\s?(?:GB|TB))\b/i.exec(name);
  if (storage) fields.storageGigabytes = storageGigabytes(storage[1]);
  if (/nano-texture/i.test(name)) fields.displayGlass = 'Nano-texture glass';
  else if (/standard (?:display|glass)/i.test(name)) fields.displayGlass = 'Standard glass';
  return completeMacSpecs(fields, name);
}

// Apple's localised names keep the numbers in the same order: screen, chip, CPU cores, GPU cores, memory, storage.
export function specsFromLocalisedMacProductName(appleName: string, fixedSpecs: SpecFields = {}): ProductSpecs | null {
  const name = withPlainSpaces(appleName);
  const chip = /\b(M\d+(?: Pro| Max| Ultra)?|A\d+(?: Pro)?)\b/i.exec(name);
  const afterChip = chip ? name.slice(chip.index + chip[0].length) : name;
  const sizes = [...afterChip.matchAll(/(\d+)\s?(GB|TB)/gi)].map(match => storageGigabytes(match[1] + match[2]));
  const coreCounts = [...afterChip.matchAll(/(?<![\w.])(\d+)(?!\d|\s?(?:GB|TB))/gi)].map(match => Number(match[1]));
  const screen = chip ? /(\d+(?:[.,]\d+)?)/.exec(name.slice(0, chip.index)) : null;
  if (!sizes.length) return null;
  const fields: SpecFields = { ...fixedSpecs, storageGigabytes: sizes.at(-1) };
  if (chip) fields.chip = chip[1];
  if (sizes.length > 1) fields.memoryGigabytes = sizes[0];
  if (coreCounts.length >= 2) [fields.cpuCoreCount, fields.gpuCoreCount] = coreCounts;
  if (screen) fields.screenSizeInches = Number(screen[1].replace(',', '.'));
  return create(ProductSpecsSchema, fields);
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');

export function configurationIdFromSpecs(specs: ProductSpecs): string {
  const parts = [
    specs.screenSizeInches && `${specs.screenSizeInches}in`,
    specs.cpuCoreCount && specs.chip && slug(specs.chip),
    specs.cpuCoreCount && `${specs.cpuCoreCount}cpu`,
    specs.gpuCoreCount && `${specs.gpuCoreCount}gpu`,
    specs.memoryGigabytes && `${specs.memoryGigabytes}gb-memory`,
    specs.storageGigabytes && `${specs.storageGigabytes}gb`,
    specs.connectivity && slug(specs.connectivity),
    specs.displayGlass && slug(specs.displayGlass),
    specs.stand && slug(specs.stand),
    specs.caseMaterial && slug(specs.caseMaterial),
    specs.caseSizeMillimetres && `${specs.caseSizeMillimetres}mm`,
    specs.packQuantity && `${specs.packQuantity}-pack`,
    specs.chargingCase && slug(specs.chargingCase),
  ].filter(Boolean);
  return parts.length ? parts.join('-') : 'standard';
}
