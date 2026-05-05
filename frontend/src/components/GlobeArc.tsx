// Decorative SVG globe + flight arc — used in the Search hero.
export default function GlobeArc({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(37,99,235,0.40)" />
          <stop offset="55%" stopColor="rgba(37,99,235,0.06)" />
          <stop offset="100%" stopColor="rgba(37,99,235,0)" />
        </radialGradient>
        <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id="meridian" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      <circle cx="300" cy="300" r="260" fill="url(#glow)" />

      {/* Globe outline */}
      <circle cx="300" cy="300" r="200" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      <circle cx="300" cy="300" r="200" fill="none" stroke="url(#meridian)" strokeWidth="1.5" />

      {/* Latitude lines */}
      {[0, 1, 2, 3, 4].map((i) => {
        const ry = 200 - i * 38;
        return (
          <ellipse
            key={`lat-${i}`}
            cx="300"
            cy="300"
            rx="200"
            ry={ry}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="1"
          />
        );
      })}
      {[0, 1, 2, 3, 4].map((i) => {
        const rx = 200 - i * 38;
        return (
          <ellipse
            key={`lon-${i}`}
            cx="300"
            cy="300"
            rx={rx}
            ry="200"
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="1"
          />
        );
      })}

      {/* Continent dots (stylised) */}
      {dots.map((d, i) => (
        <circle key={i} cx={d[0]} cy={d[1]} r={d[2]} fill="rgba(255,255,255,0.25)" />
      ))}

      {/* Flight arc */}
      <path
        d="M 130 360 Q 300 80, 470 240"
        fill="none"
        stroke="url(#arcGrad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 6"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="3s" repeatCount="indefinite" />
      </path>
      <circle cx="130" cy="360" r="5" fill="#2563EB" />
      <circle cx="470" cy="240" r="5" fill="#10B981" />
      <circle cx="130" cy="360" r="12" fill="#2563EB" opacity="0.25">
        <animate attributeName="r" from="5" to="22" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="470" cy="240" r="12" fill="#10B981" opacity="0.25">
        <animate attributeName="r" from="5" to="22" dur="2s" begin="1s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.5" to="0" dur="2s" begin="1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

const dots: [number, number, number][] = [
  // Eurasia-ish stylised
  [220, 230, 2],
  [240, 220, 1.5],
  [260, 215, 1.8],
  [280, 225, 2],
  [305, 218, 1.6],
  [325, 230, 1.8],
  [350, 245, 1.4],
  [375, 265, 1.6],
  [395, 285, 1.4],
  // Africa
  [285, 305, 2],
  [305, 330, 1.6],
  [320, 360, 1.4],
  [330, 390, 1.4],
  // Americas
  [165, 250, 1.6],
  [180, 285, 1.8],
  [195, 320, 1.6],
  [210, 360, 1.4],
  [220, 395, 1.2],
  [240, 415, 1.4],
  // Australia/Oceania
  [415, 365, 1.6],
  [440, 380, 1.4],
  [460, 400, 1.2],
  // Misc
  [375, 370, 1.2],
  [400, 395, 1.0],
];
