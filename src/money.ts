const currencySymbols: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CNY: 'CN¥', JPY: '¥', CAD: 'CA$', AUD: 'A$', CHF: 'CHF\u00a0', HKD: 'HK$', SGD: 'S$', NZD: 'NZ$', MXN: 'MX$', TWD: 'NT$', CLP: 'CLP$',
  TRY: '₺', INR: '₹', KRW: '₩', VND: '₫', BRL: 'R$', THB: '฿', PHP: '₱', MYR: 'RM\u00a0', HUF: 'Ft\u00a0', PLN: 'zł\u00a0', CZK: 'Kč\u00a0', DKK: 'DKK\u00a0', SEK: 'SEK\u00a0', NOK: 'NOK\u00a0',
  AED: 'AED\u00a0', SAR: 'SAR\u00a0', MOP: 'MOP$', ILS: '₪',
};

const withThousandsSeparators = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Whole amounts, except under 100, where the cents decide which place is cheaper (an AirTag at $28.72 or $29.00).
// Amounts in the millions (dong, won) can be shortened where space is tight: ₫146.0m.
// A difference between two whole amounts is whole too: $64 more, not $63.66.
export function formatMoney(amount: number, currencyCode: string, { shortenMillions = false, alwaysWhole = false } = {}): string {
  const symbol = currencySymbols[currencyCode] ?? `${currencyCode}\u00a0`;
  if (shortenMillions && amount >= 1e6) return `${symbol}${(amount / 1e6).toFixed(amount >= 1e7 ? 1 : 2)}m`;
  if (amount < 100 && !alwaysWhole) return `${symbol}${amount.toFixed(2)}`;
  return `${symbol}${withThousandsSeparators(String(Math.round(amount)))}`;
}

// The currencies offered after US dollars and the visitor's own, most widely held first.
export const widelyHeldCurrencyCodes = ['EUR', 'GBP', 'CNY', 'JPY', 'CAD', 'AUD', 'CHF', 'HKD', 'SGD'];
