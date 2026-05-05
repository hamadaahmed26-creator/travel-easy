import clsx from 'clsx';

export const cn = clsx;

export function formatGBP(n: number, opts: { decimals?: boolean } = {}): string {
  if (opts.decimals)
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 2,
    }).format(n);
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

export function fmtRange(checkIn: string, checkOut: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

export function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function toSlug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-');
}

// Render a confidence-like value as a 0-100 integer percent, regardless of
// whether the API delivers it as 0-1 (fraction) or 0-100 (percent already).
export function pct(value: number): number {
  if (!isFinite(value)) return 0;
  const v = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(v)));
}
