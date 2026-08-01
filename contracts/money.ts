/** Money is stored as integer paise (1 INR = 100 paise) everywhere. */

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(paise: number, precise = false): string {
  const f = precise || paise % 100 !== 0 ? inrPrecise : inr;
  return f.format(paise / 100);
}

/** Compact axis-friendly format: ₹1.2k, ₹850 */
export function formatINRCompact(paise: number): string {
  const r = paise / 100;
  if (Math.abs(r) >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  if (Math.abs(r) >= 1000) return `₹${(r / 1000).toFixed(1)}k`;
  return `₹${Math.round(r)}`;
}
