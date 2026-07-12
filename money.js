// Monetary values are persisted as integer minor units with an explicit ISO 4217 code.
// ECPay currently settles DonationBar donations in TWD. Keep this allowlist explicit;
// adding another provider/currency must be a deliberate adapter decision, not an
// arbitrary three-letter string.
export const SUPPORTED_DONATION_CURRENCIES = new Set(['TWD']);
export function parseMinorUnitAmount(value, { maximum = 1_000_000 } = {}) {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return NaN;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= maximum ? amount : NaN;
}

export function normalizeCurrency(value, fallback = 'TWD') {
  const currency = String(value || fallback).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) && SUPPORTED_DONATION_CURRENCIES.has(currency) ? currency : null;
}
