// TripOpt — design tokens (Swiss & High-Contrast / Fintech-meets-Travel)
export const colors = {
  bg: "#FFFFFF",
  bgAlt: "#F8FAFC",
  surface: "#FFFFFF",
  ink: "#0A0A0A",
  inkSecondary: "#475569",
  inkMuted: "#94A3B8",
  brand: "#0F172A",
  buy: "#059669",
  buyBg: "#D1FAE5",
  wait: "#EA580C",
  waitBg: "#FFEDD5",
  riskLow: "#2563EB",
  riskLowBg: "#DBEAFE",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  accent: "#0F172A",
  warning: "#F59E0B",
  ranking: {
    Cheapest: "#0F172A",
    "Best Value": "#2563EB",
    "Lowest Risk": "#059669",
  } as const,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const fonts = {
  // System font stacks; bold weights deliver the Swiss/architectural feel.
  display: undefined as unknown as string,
  body: undefined as unknown as string,
};
