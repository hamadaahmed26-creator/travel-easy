// TripOpt — Cinematic Dark Navy palette (Linear/Stripe vibes meets travel)
export const colors = {
  // Cinematic dark base
  bg: "#05070F",          // near black canvas
  bgAlt: "#0A0E1F",       // slightly lighter dark
  bgElev: "#0F1530",      // elevated surfaces
  surface: "rgba(255,255,255,0.04)", // glass card base
  surfaceStrong: "rgba(255,255,255,0.08)",
  surfaceHover: "rgba(255,255,255,0.10)",

  // Inks
  ink: "#FFFFFF",
  inkSecondary: "#B6BFD6",
  inkMuted: "#6F7A99",
  inkDim: "#465070",

  // Brand & accents
  brand: "#5B8FFF",        // electric blue primary
  brandStrong: "#7BA6FF",
  brandGlow: "rgba(91,143,255,0.35)",

  // Status (vibrant for dark bg)
  buy: "#34D399",          // emerald
  buyBg: "rgba(52,211,153,0.12)",
  wait: "#FBBF24",         // amber
  waitBg: "rgba(251,191,36,0.12)",
  riskLow: "#5B8FFF",
  riskLowBg: "rgba(91,143,255,0.12)",
  danger: "#F87171",

  // Borders
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.18)",
  borderGlow: "rgba(91,143,255,0.45)",

  // Gradients
  gradHero: ["#05070F", "#0A1234", "#0E1A4A"] as const,
  gradAccent: ["#5B8FFF", "#7C5BFF"] as const,
  gradVerdict: ["#0E1A4A", "#1A2A6E"] as const,
  gradPriceUp: ["rgba(248,113,113,0.0)", "rgba(248,113,113,0.5)"] as const,
  gradPriceDown: ["rgba(52,211,153,0.0)", "rgba(52,211,153,0.5)"] as const,

  // Rank label colors
  ranking: {
    Cheapest: "#34D399",
    "Best Value": "#5B8FFF",
    "Lowest Risk": "#A78BFA",
  } as const,

  // Legacy keys kept for backward compatibility on un-touched screens
  accent: "#5B8FFF",
  warning: "#FBBF24",
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 32,
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
  xxxxl: 64,
};

export const fonts = {
  display: undefined as unknown as string,
  body: undefined as unknown as string,
};

// Shadow presets for elevation (web preview compatible)
export const shadows = {
  glass: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 4,
  },
  glow: {
    shadowColor: "#5B8FFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 12,
  },
};
