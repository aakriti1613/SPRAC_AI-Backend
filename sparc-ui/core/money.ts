// Shows an amount in the store's currency, e.g. money(499, "INR") -> "₹499.00".
export function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`; // unknown currency code
  }
}
