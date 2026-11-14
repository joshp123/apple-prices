export type SalesTaxSource = { sourceName: string; sourceUrl: string; ratesEffectiveDate: string; salesTaxMethod: string };

export const unitedStatesSalesTaxSource: SalesTaxSource = {
  sourceName: 'Tax Foundation, State and Local Sales Tax Rates, Midyear 2026',
  sourceUrl: 'https://taxfoundation.org/data/all/state/2026-sales-tax-rates-midyear/',
  ratesEffectiveDate: '2026-07-01',
  salesTaxMethod: 'Population-weighted average of state and local sales tax',
};

export const canadaSalesTaxSource: SalesTaxSource = {
  sourceName: 'Canada Revenue Agency, GST/HST and PST rates by province',
  sourceUrl: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html',
  ratesEffectiveDate: '2025-04-01',
  salesTaxMethod: 'GST or HST plus provincial sales tax',
};

// Combined state and average local rate, percent.
export const unitedStatesCombinedSalesTaxPercent: Record<string, [string, number]> = {
  'US-AL': ['Alabama', 9.46], 'US-AK': ['Alaska', 1.82], 'US-AZ': ['Arizona', 8.54], 'US-AR': ['Arkansas', 9.48],
  'US-CA': ['California', 9.03], 'US-CO': ['Colorado', 7.89], 'US-CT': ['Connecticut', 6.35], 'US-DE': ['Delaware', 0],
  'US-DC': ['District of Columbia', 6.0], 'US-FL': ['Florida', 6.98], 'US-GA': ['Georgia', 7.56], 'US-HI': ['Hawaii', 4.5],
  'US-ID': ['Idaho', 6.03], 'US-IL': ['Illinois', 8.98], 'US-IN': ['Indiana', 7.0], 'US-IA': ['Iowa', 6.94],
  'US-KS': ['Kansas', 8.71], 'US-KY': ['Kentucky', 6.0], 'US-LA': ['Louisiana', 10.13], 'US-ME': ['Maine', 5.5],
  'US-MD': ['Maryland', 6.0], 'US-MA': ['Massachusetts', 6.25], 'US-MI': ['Michigan', 6.0], 'US-MN': ['Minnesota', 8.14],
  'US-MS': ['Mississippi', 7.06], 'US-MO': ['Missouri', 8.44], 'US-MT': ['Montana', 0], 'US-NE': ['Nebraska', 6.98],
  'US-NV': ['Nevada', 8.24], 'US-NH': ['New Hampshire', 0], 'US-NJ': ['New Jersey', 6.6], 'US-NM': ['New Mexico', 7.68],
  'US-NY': ['New York', 8.54], 'US-NC': ['North Carolina', 7.1], 'US-ND': ['North Dakota', 7.09], 'US-OH': ['Ohio', 7.29],
  'US-OK': ['Oklahoma', 9.06], 'US-OR': ['Oregon', 0], 'US-PA': ['Pennsylvania', 6.34], 'US-RI': ['Rhode Island', 7.0],
  'US-SC': ['South Carolina', 7.49], 'US-SD': ['South Dakota', 6.11], 'US-TN': ['Tennessee', 9.61], 'US-TX': ['Texas', 8.2],
  'US-UT': ['Utah', 7.42], 'US-VT': ['Vermont', 6.43], 'US-VA': ['Virginia', 5.77], 'US-WA': ['Washington', 9.57],
  'US-WV': ['West Virginia', 6.6], 'US-WI': ['Wisconsin', 5.72], 'US-WY': ['Wyoming', 5.39],
};

export const canadaCombinedSalesTaxPercent: Record<string, [string, number]> = {
  'CA-AB': ['Alberta', 5], 'CA-BC': ['British Columbia', 12], 'CA-MB': ['Manitoba', 12], 'CA-NB': ['New Brunswick', 15],
  'CA-NL': ['Newfoundland and Labrador', 15], 'CA-NT': ['Northwest Territories', 5], 'CA-NS': ['Nova Scotia', 14],
  'CA-NU': ['Nunavut', 5], 'CA-ON': ['Ontario', 13], 'CA-PE': ['Prince Edward Island', 15], 'CA-QC': ['Quebec', 14.975],
  'CA-SK': ['Saskatchewan', 11], 'CA-YT': ['Yukon', 5],
};
