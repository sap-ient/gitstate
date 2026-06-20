/**
 * Static approximate display rates from USD (≈ mid-2026 values).
 * Real charge rate comes from the backend exchange service at checkout;
 * this static table is the UI display fallback only.
 *
 * Shape: { code, locale, flag, label, symbol, decimals, rate }
 *   - code:     ISO 4217 currency code (also passed to Intl.NumberFormat).
 *   - locale:   BCP-47 locale used for number grouping/symbol placement.
 *   - flag:     emoji shown in the selector.
 *   - label:    short human name shown in the selector.
 *   - symbol:   conventional symbol (informational; Intl renders the real one).
 *   - decimals: fraction digits (0 for JPY/KRW/VND/IDR/etc, else 2).
 *   - rate:     approximate USD→code multiplier for display.
 */
export const CURRENCIES = [
  // Majors
  { code: 'USD', locale: 'en-US', flag: '🇺🇸', label: 'US Dollar',        symbol: '$',   decimals: 2, rate: 1 },
  { code: 'EUR', locale: 'de-DE', flag: '🇪🇺', label: 'Euro',             symbol: '€',   decimals: 2, rate: 0.917 },
  { code: 'GBP', locale: 'en-GB', flag: '🇬🇧', label: 'British Pound',    symbol: '£',   decimals: 2, rate: 0.786 },
  { code: 'JPY', locale: 'ja-JP', flag: '🇯🇵', label: 'Japanese Yen',     symbol: '¥',   decimals: 0, rate: 157 },
  { code: 'CNY', locale: 'zh-CN', flag: '🇨🇳', label: 'Chinese Yuan',     symbol: '¥',   decimals: 2, rate: 7.18 },
  { code: 'CHF', locale: 'de-CH', flag: '🇨🇭', label: 'Swiss Franc',      symbol: 'CHF', decimals: 2, rate: 0.895 },
  { code: 'CAD', locale: 'en-CA', flag: '🇨🇦', label: 'Canadian Dollar',  symbol: 'CA$', decimals: 2, rate: 1.37 },
  { code: 'AUD', locale: 'en-AU', flag: '🇦🇺', label: 'Australian Dollar',symbol: 'A$',  decimals: 2, rate: 1.51 },
  { code: 'NZD', locale: 'en-NZ', flag: '🇳🇿', label: 'NZ Dollar',        symbol: 'NZ$', decimals: 2, rate: 1.64 },

  // Nordics
  { code: 'SEK', locale: 'sv-SE', flag: '🇸🇪', label: 'Swedish Krona',    symbol: 'kr',  decimals: 2, rate: 10.55 },
  { code: 'NOK', locale: 'nb-NO', flag: '🇳🇴', label: 'Norwegian Krone',  symbol: 'kr',  decimals: 2, rate: 10.75 },
  { code: 'DKK', locale: 'da-DK', flag: '🇩🇰', label: 'Danish Krone',     symbol: 'kr',  decimals: 2, rate: 6.84 },

  // Europe (non-euro)
  { code: 'PLN', locale: 'pl-PL', flag: '🇵🇱', label: 'Polish Złoty',     symbol: 'zł',  decimals: 2, rate: 3.98 },
  { code: 'TRY', locale: 'tr-TR', flag: '🇹🇷', label: 'Turkish Lira',     symbol: '₺',   decimals: 2, rate: 38.5 },

  // Americas
  { code: 'BRL', locale: 'pt-BR', flag: '🇧🇷', label: 'Brazilian Real',   symbol: 'R$',  decimals: 2, rate: 5.45 },
  { code: 'MXN', locale: 'es-MX', flag: '🇲🇽', label: 'Mexican Peso',     symbol: 'MX$', decimals: 2, rate: 18.6 },
  { code: 'ARS', locale: 'es-AR', flag: '🇦🇷', label: 'Argentine Peso',   symbol: '$',   decimals: 2, rate: 1180 },

  // Africa
  { code: 'ZAR', locale: 'en-ZA', flag: '🇿🇦', label: 'South African Rand',symbol: 'R',  decimals: 2, rate: 18.70 },
  { code: 'NGN', locale: 'en-NG', flag: '🇳🇬', label: 'Nigerian Naira',   symbol: '₦',   decimals: 2, rate: 1550 },
  { code: 'KES', locale: 'en-KE', flag: '🇰🇪', label: 'Kenyan Shilling',  symbol: 'KSh', decimals: 2, rate: 129 },
  { code: 'EGP', locale: 'ar-EG', flag: '🇪🇬', label: 'Egyptian Pound',   symbol: '£',   decimals: 2, rate: 49.5 },

  // Middle East
  { code: 'AED', locale: 'ar-AE', flag: '🇦🇪', label: 'UAE Dirham',       symbol: 'AED', decimals: 2, rate: 3.67 },
  { code: 'SAR', locale: 'ar-SA', flag: '🇸🇦', label: 'Saudi Riyal',      symbol: '﷼',   decimals: 2, rate: 3.75 },
  { code: 'ILS', locale: 'he-IL', flag: '🇮🇱', label: 'Israeli Shekel',   symbol: '₪',   decimals: 2, rate: 3.66 },

  // South & Southeast Asia
  { code: 'INR', locale: 'en-IN', flag: '🇮🇳', label: 'Indian Rupee',     symbol: '₹',   decimals: 2, rate: 85.5 },
  { code: 'SGD', locale: 'en-SG', flag: '🇸🇬', label: 'Singapore Dollar', symbol: 'S$',  decimals: 2, rate: 1.34 },
  { code: 'HKD', locale: 'en-HK', flag: '🇭🇰', label: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2, rate: 7.80 },
  { code: 'KRW', locale: 'ko-KR', flag: '🇰🇷', label: 'South Korean Won', symbol: '₩',   decimals: 0, rate: 1370 },
  { code: 'IDR', locale: 'id-ID', flag: '🇮🇩', label: 'Indonesian Rupiah',symbol: 'Rp',  decimals: 0, rate: 16300 },
  { code: 'MYR', locale: 'ms-MY', flag: '🇲🇾', label: 'Malaysian Ringgit',symbol: 'RM',  decimals: 2, rate: 4.42 },
  { code: 'PHP', locale: 'en-PH', flag: '🇵🇭', label: 'Philippine Peso',  symbol: '₱',   decimals: 2, rate: 57.5 },
  { code: 'THB', locale: 'th-TH', flag: '🇹🇭', label: 'Thai Baht',        symbol: '฿',   decimals: 2, rate: 33.0 },
  { code: 'VND', locale: 'vi-VN', flag: '🇻🇳', label: 'Vietnamese Đồng',  symbol: '₫',   decimals: 0, rate: 25400 },
]

/** Fast lookup by ISO code. */
export const CURRENCY_BY_CODE = Object.fromEntries(CURRENCIES.map(c => [c.code, c]))
