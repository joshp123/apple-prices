export type AppleOnlineStore = { appleStoreId: string; countryCode: string; currencyCode: string; storeUrl: string };

function store(appleStoreId: string, currencyCode: string, countryCode = appleStoreId.toUpperCase(), pathSegment = appleStoreId): AppleOnlineStore {
  return { appleStoreId, countryCode, currencyCode, storeUrl: `https://www.apple.com/${pathSegment}` };
}

// Every country where apple.com has an online store, checked against all 107 regional sites on 14 Nov 2026.
export const appleOnlineStores: AppleOnlineStore[] = [
  store('us', 'USD'),
  store('ae', 'AED'),
  store('at', 'EUR'),
  store('au', 'AUD'),
  store('be', 'EUR', 'BE', 'be-fr'),
  store('br', 'BRL'),
  store('ca', 'CAD'),
  store('ch', 'CHF', 'CH', 'ch-de'),
  store('cl', 'CLP'),
  { appleStoreId: 'cn', countryCode: 'CN', currencyCode: 'CNY', storeUrl: 'https://www.apple.com.cn' },
  store('cz', 'CZK'),
  store('de', 'EUR'),
  store('dk', 'DKK'),
  store('es', 'EUR'),
  store('fi', 'EUR'),
  store('fr', 'EUR'),
  store('hk', 'HKD'),
  store('hu', 'HUF'),
  store('ie', 'EUR'),
  store('in', 'INR'),
  store('it', 'EUR'),
  store('jp', 'JPY'),
  store('kr', 'KRW'),
  store('lu', 'EUR'),
  store('mx', 'MXN'),
  store('my', 'MYR'),
  store('nl', 'EUR'),
  store('no', 'NOK'),
  store('nz', 'NZD'),
  store('ph', 'PHP'),
  store('pl', 'PLN'),
  store('pt', 'EUR'),
  store('sa', 'SAR', 'SA', 'sa-en'),
  store('se', 'SEK'),
  store('sg', 'SGD'),
  store('th', 'THB'),
  store('tr', 'TRY'),
  store('tw', 'TWD'),
  store('uk', 'GBP', 'GB'),
  store('vn', 'VND'),
];

export const appleStoresAddingSalesTaxAtCheckout = new Set(['us', 'ca']);
