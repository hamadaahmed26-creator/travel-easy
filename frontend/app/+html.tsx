// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

const TITLE = "TripOpt — Optimise your whole trip";
const DESCRIPTION =
  "Tell us your budget. We pick the best whole trip — flights + hotels + dates — like a portfolio. Or hit Surprise Me for a mystery destination.";

// Inline SVG favicon: dark navy gradient square with bold white "T".
// Encoded as data URI so no extra static asset is needed.
const FAVICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7C5BFF"/>
      <stop offset="100%" stop-color="#5B8FFF"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#05070F"/>
  <rect x="2" y="2" width="60" height="60" rx="13" fill="url(#g)"/>
  <text x="32" y="44" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Inter, sans-serif" font-size="38" font-weight="900" text-anchor="middle" fill="#FFFFFF" letter-spacing="-2">T</text>
</svg>`.trim();

const FAVICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(FAVICON_SVG)}`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%", backgroundColor: "#05070F" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* Primary tab title + description */}
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="theme-color" content="#05070F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TripOpt" />

        {/* Favicon (SVG inline so no extra asset) */}
        <link rel="icon" type="image/svg+xml" href={FAVICON_DATA_URI} />
        <link rel="apple-touch-icon" href={FAVICON_DATA_URI} />

        {/* Open Graph (Facebook / WhatsApp / iMessage / LinkedIn / Slack) */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:site_name" content="TripOpt" />

        {/* Twitter card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />

        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
          If you want to enable scrolling, remove `ScrollViewStyleReset` and
          set `overflow: auto` on the body style below.
        */}
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { background-color: #05070F; }
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#05070F",
        }}
      >
        {children}
      </body>
    </html>
  );
}
