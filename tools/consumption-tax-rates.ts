// The standard VAT, GST or consumption tax in each Apple store's shelf price, so a price can be shown before tax. Each rate was checked as
// current on 15 November 2026 against the authority named. Stores that add tax at checkout (US, Canada) are in sales-tax-rates.ts instead.
import { create } from '@bufbuild/protobuf';
import { ConsumptionTaxSchema, ProductCategory, ProductTaxesSchema, TaxBase, TaxOnSaleSchema, type ConsumptionTax } from '../src/generated/apple_prices/v1/price_snapshot_pb.js';

type Tax = { name: string; percent: number; base?: TaxBase };
// Every tax on the sale of one kind of product, in the order charged; or why one could not be confirmed.
type ProductTaxesRow = { categories?: ProductCategory[]; productIds?: string[]; taxes?: Tax[]; whyNotKnown?: string; sourceName: string; sourceUrl: string };
export type ConsumptionTaxRate = { percent?: number; taxName: string; whyNoSingleRate?: string; sourceName: string; sourceUrl: string; productTaxes?: ProductTaxesRow[] };

export const consumptionTaxesCheckedOn = '2026-11-15';

const euTable = { sourceName: 'European Commission, Your Europe: VAT rates applied in EU countries', sourceUrl: 'https://europa.eu/youreurope/business/finance-and-tax/vat/vat-rules-rates/index_en.htm' };
const eu = (percent: number): ConsumptionTaxRate => ({ percent, taxName: 'VAT', ...euTable });

// Brazil: the state sales tax (ICMS, São Paulo's 18%) is a share of the price, including IPI; PIS and COFINS (9.25%) a share of the price less
// ICMS and IPI (STF, Tema 69); IPI is charged on the price without it, at a rate that depends on the product.
const brazil = (ipiPercent: number): Tax[] => [
  { name: 'state sales tax', percent: 18, base: TaxBase.SHARE_OF_PRICE }, { name: 'PIS and COFINS', percent: 9.25, base: TaxBase.SHARE_OF_REVENUE }, { name: 'IPI', percent: ipiPercent },
];
const brazilSource = (ncm: string) => ({ sourceName: `Receita Federal, TIPI: IPI on ${ncm}; STF Tema 69; São Paulo ICMS 18%`, sourceUrl: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.pdf' });
const malaysiaOrder = 'https://mysst.customs.gov.my/assets/document/SST%20Orders/order/1-PUA%20170_2025.pdf';

export const consumptionTaxByCountry: Record<string, ConsumptionTaxRate> = {
  AT: eu(20), BE: eu(21), CZ: eu(21), DE: eu(19), DK: eu(25), ES: eu(21), FI: eu(25.5), FR: eu(20), HU: eu(27), IE: eu(23), IT: eu(22), LU: eu(17),
  NL: eu(21), PL: eu(23), PT: eu(23), SE: eu(25),
  AE: { percent: 5, taxName: 'VAT', sourceName: 'UAE Federal Tax Authority, VAT', sourceUrl: 'https://tax.gov.ae/en/taxes/vat.aspx' },
  AU: { percent: 10, taxName: 'GST', sourceName: 'Australian Taxation Office, GST', sourceUrl: 'https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst' },
  CH: { percent: 8.1, taxName: 'VAT', sourceName: 'Swiss Federal Tax Administration, VAT rates', sourceUrl: 'https://www.estv.admin.ch/estv/en/home/value-added-tax/vat-rates-switzerland.html' },
  CL: { percent: 19, taxName: 'VAT', sourceName: 'Chile, D.L. 825 (Ley sobre Impuesto a las Ventas y Servicios), article 14', sourceUrl: 'https://www.bcn.cl/leychile/navegar?idNorma=6369' },
  CN: { percent: 13, taxName: 'VAT', sourceName: 'State Taxation Administration, Value-Added Tax Law (in force 1 January 2026)', sourceUrl: 'https://www.chinatax.gov.cn/eng/' },
  GB: { percent: 20, taxName: 'VAT', sourceName: 'GOV.UK, VAT rates', sourceUrl: 'https://www.gov.uk/vat-rates' },
  HK: { percent: 0, taxName: 'no consumption tax', sourceName: 'Inland Revenue Department, Hong Kong: no VAT or GST', sourceUrl: 'https://www.ird.gov.hk/eng/tax/index.htm' },
  IN: { percent: 18, taxName: 'GST', sourceName: 'CBIC, Notification 9/2025-Central Tax (Rate): phones and computers at 18%', sourceUrl: 'https://cbic-gst.gov.in/' },
  JP: { percent: 10, taxName: 'consumption tax', sourceName: 'National Tax Agency, Tax Answer No. 6303', sourceUrl: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6303.htm' },
  KR: { percent: 10, taxName: 'VAT', sourceName: 'National Tax Service, VAT', sourceUrl: 'https://www.nts.go.kr/english/' },
  MO: { percent: 0, taxName: 'no consumption tax', sourceName: 'Financial Services Bureau, Macau: no VAT or sales tax', sourceUrl: 'https://www.dsf.gov.mo/' },
  MX: { percent: 16, taxName: 'VAT', sourceName: 'Ley del Impuesto al Valor Agregado, article 1', sourceUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf' },
  NO: { percent: 25, taxName: 'VAT', sourceName: 'Skatteetaten, value added tax rates', sourceUrl: 'https://www.skatteetaten.no/en/rates/value-added-tax/' },
  NZ: { percent: 15, taxName: 'GST', sourceName: 'Inland Revenue, GST', sourceUrl: 'https://www.ird.govt.nz/gst' },
  PH: { percent: 12, taxName: 'VAT', sourceName: 'Bureau of Internal Revenue, value-added tax', sourceUrl: 'https://www.bir.gov.ph/value-added-tax' },
  SA: { percent: 15, taxName: 'VAT', sourceName: 'Zakat, Tax and Customs Authority, VAT', sourceUrl: 'https://zatca.gov.sa/en/RulesRegulations/Taxes/Pages/default.aspx' },
  SG: { percent: 9, taxName: 'GST', sourceName: 'IRAS, current GST rates', sourceUrl: 'https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/current-gst-rates' },
  TH: { percent: 7, taxName: 'VAT', sourceName: 'Revenue Department, Royal Decree No. 807: 7% to 30 September 2027', sourceUrl: 'https://www.rd.go.th/english/' },
  TW: { percent: 5, taxName: 'business tax', sourceName: 'Ministry of Finance, business tax', sourceUrl: 'https://www.mof.gov.tw/' },
  VN: { percent: 8, taxName: 'VAT', sourceName: 'Resolution 204/2025/QH15: 10% cut to 8% to 31 December 2026', sourceUrl: 'https://chinhphu.vn/' },
  // Phones and computers carry extra taxes in these three countries, so their rates depend on the kind of product (checked 16 Nov 2026).
  TR: {
    percent: 20, taxName: 'VAT', sourceName: 'Revenue Administration (GİB), KDV rates', sourceUrl: 'https://www.gib.gov.tr/',
    productTaxes: [
      {
        // Each charged on the total before it: ₺229,999 for iPhone Duo is ₺112,960 before tax, as Deutsche Welle worked it out.
        categories: [ProductCategory.IPHONE],
        taxes: [{ name: 'culture ministry share', percent: 1 }, { name: 'TRT fee', percent: 12 }, { name: 'special consumption tax', percent: 50 }, { name: 'VAT', percent: 20 }],
        sourceName: 'Deutsche Welle, iPhone Duo: why phones cost more in Turkey (11 Sep 2026); ÖTV list IV, top band', sourceUrl: 'https://www.dw.com/tr/iphone-duo-t%C3%BCrkiyede-neden-di%C4%9Fer-%C3%BClkelerden-daha-pahal%C4%B1/a-79231884',
      },
      {
        categories: [ProductCategory.IPAD, ProductCategory.MAC], taxes: [{ name: 'TRT fee', percent: 4 }, { name: 'VAT', percent: 20 }],
        sourceName: 'Presidential Decision 5610 on TRT fees (Resmî Gazete, 26 May 2022): computers and tablets 4%', sourceUrl: 'https://www.resmigazete.gov.tr/eskiler/2022/05/20220526-15.pdf',
      },
      {
        categories: [ProductCategory.AIRPODS, ProductCategory.HOME, ProductCategory.DISPLAY, ProductCategory.WATCH, ProductCategory.VISION], productIds: ['airtag'],
        whyNotKnown: 'the rate of its special consumption tax on this kind of product could not be confirmed',
        sourceName: 'ÖTV list IV names headphones, loudspeakers, televisions and other sound and picture devices', sourceUrl: 'https://www.gib.gov.tr/',
      },
    ],
  },
  BR: {
    taxName: 'taxes', whyNoSingleRate: 'its taxes on this kind of product could not be confirmed',
    sourceName: 'Receita Federal, TIPI (IPI rates)', sourceUrl: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.pdf',
    productTaxes: [
      { categories: [ProductCategory.IPHONE], taxes: brazil(15), ...brazilSource('8517.13.00') },
      { categories: [ProductCategory.IPAD], taxes: brazil(15), ...brazilSource('8471.30.12') },
      { productIds: ['imac'], taxes: brazil(9.75), ...brazilSource('8471.41.00') },
      { categories: [ProductCategory.MAC], taxes: brazil(15), ...brazilSource('8471.30 and 8471.50.10') },
      { categories: [ProductCategory.DISPLAY], taxes: brazil(15), ...brazilSource('8528.52.00') },
      { categories: [ProductCategory.AIRPODS], taxes: brazil(9.75), ...brazilSource('8518.30.00') },
      { productIds: ['homepod', 'homepod-mini-2'], taxes: brazil(15), ...brazilSource('8518.22.00') },
    ],
  },
  MY: {
    taxName: 'sales tax', whyNoSingleRate: 'its sales tax on this kind of product could not be confirmed',
    sourceName: 'Royal Malaysian Customs, Sales Tax (Rate of Sales Tax) Order 2025', sourceUrl: malaysiaOrder,
    productTaxes: [
      {
        categories: [ProductCategory.IPHONE, ProductCategory.IPAD, ProductCategory.MAC, ProductCategory.DISPLAY], productIds: ['apple-pencil-pro', 'apple-pencil-usb-c'],
        taxes: [{ name: 'sales tax', percent: 5 }], sourceName: 'Sales Tax (Rate of Sales Tax) Order 2025, First Schedule: smartphones, heading 84.71, monitors 8528.52', sourceUrl: malaysiaOrder,
      },
      {
        categories: [ProductCategory.AIRPODS], productIds: ['homepod', 'homepod-mini-2', 'apple-tv-4k', 'airtag'],
        taxes: [{ name: 'sales tax', percent: 10 }], sourceName: 'Sales Tax (Rate of Sales Tax) Order 2025, paragraph 2(1): 10% on goods not in a schedule', sourceUrl: malaysiaOrder,
      },
    ],
  },
};

// The snapshot's record of a store's consumption tax. A store whose shelf price includes tax must have a row above, so a new store
// cannot ship without one.
export function consumptionTaxOf(countryCode: string, shelfPriceIncludesSalesTax: boolean): ConsumptionTax | undefined {
  if (!shelfPriceIncludesSalesTax) return undefined;
  const rate = consumptionTaxByCountry[countryCode];
  if (!rate) throw new Error(`No consumption tax rate for ${countryCode} in tools/consumption-tax-rates.ts`);
  const productTaxes = (rate.productTaxes ?? []).map(row => create(ProductTaxesSchema, {
    categories: row.categories ?? [], productIds: row.productIds ?? [], whyNotKnown: row.whyNotKnown ?? '', sourceName: row.sourceName, sourceUrl: row.sourceUrl,
    taxes: (row.taxes ?? []).map(tax => create(TaxOnSaleSchema, { name: tax.name, percent: tax.percent, base: tax.base ?? TaxBase.ADDED })),
  }));
  return create(ConsumptionTaxSchema, { ...rate, whyNoSingleRate: rate.whyNoSingleRate ?? '', checkedOn: consumptionTaxesCheckedOn, productTaxes });
}
