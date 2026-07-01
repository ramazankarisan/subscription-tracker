/** Money formatting. Falls back gracefully if a currency code is unknown. */
export function formatCurrency(amount: number, currency: string): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    // Unknown/invalid currency code — show the number with the code appended.
    return `${safeAmount.toFixed(2)} ${currency}`.trim();
  }
}
