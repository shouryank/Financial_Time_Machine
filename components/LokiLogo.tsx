
import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

/** Loki-inspired Time Machine logo — branching timeline horns with a clock core */
const LokiLogo: React.FC<{ size?: number }> = ({ size = 44 }) => {
  const { isDark } = useTheme();
  const goldPrimary = isDark ? '#f59e0b' : '#d97706';
  const goldLight = isDark ? '#fbbf24' : '#f59e0b';
  const glowColor = isDark ? 'rgba(245,158,11,0.5)' : 'rgba(217,119,6,0.3)';
  const centerFill = isDark ? '#020617' : '#f8fafc';
  const runeColor = isDark ? '#fbbf24' : '#d97706';
  const outerRing = isDark ? '#92400e' : '#b45309';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-lg"
      style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
    >
      {/* Outer ring */}
      <circle cx="50" cy="50" r="46" stroke={outerRing} strokeWidth="2" opacity="0.5" />
      <circle cx="50" cy="50" r="42" stroke={goldPrimary} strokeWidth="2.5" />

      {/* Decorative rune marks around the ring */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 50 + 38 * Math.cos(rad);
        const y1 = 50 + 38 * Math.sin(rad);
        const x2 = 50 + 42 * Math.cos(rad);
        const y2 = 50 + 42 * Math.sin(rad);
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={runeColor} strokeWidth="1.5" opacity="0.6" />
        );
      })}

      {/* Inner filled circle */}
      <circle cx="50" cy="50" r="34" fill={centerFill} stroke={goldPrimary} strokeWidth="1" />

      {/* Branching timeline horns — Loki's iconic horns reimagined as timeline forks */}
      {/* Left horn */}
      <path
        d="M 50 50 L 30 22 L 22 10"
        stroke={goldPrimary}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 30 22 L 20 18"
        stroke={goldLight}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Left horn branch fork */}
      <circle cx="22" cy="10" r="2.5" fill={goldLight} />
      <circle cx="20" cy="18" r="2" fill={goldLight} opacity="0.8" />

      {/* Right horn */}
      <path
        d="M 50 50 L 70 22 L 78 10"
        stroke={goldPrimary}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 70 22 L 80 18"
        stroke={goldLight}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right horn branch fork */}
      <circle cx="78" cy="10" r="2.5" fill={goldLight} />
      <circle cx="80" cy="18" r="2" fill={goldLight} opacity="0.8" />

      {/* Central timeline stem going down */}
      <path
        d="M 50 50 L 50 78"
        stroke={goldPrimary}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Bottom fork */}
      <path
        d="M 50 70 L 40 80"
        stroke={goldLight}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 50 70 L 60 80"
        stroke={goldLight}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="50" cy="78" r="2" fill={goldLight} />
      <circle cx="40" cy="80" r="1.5" fill={goldLight} opacity="0.7" />
      <circle cx="60" cy="80" r="1.5" fill={goldLight} opacity="0.7" />

      {/* Center nexus dot — the "now" point */}
      <circle cx="50" cy="50" r="5" fill={goldPrimary}>
        <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="50" r="2.5" fill={centerFill} />

      {/* Tiny clock hands inside the nexus */}
      <line x1="50" y1="50" x2="50" y2="44" stroke={goldPrimary} strokeWidth="1.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="12s" repeatCount="indefinite" />
      </line>
      <line x1="50" y1="50" x2="54" y2="48" stroke={goldLight} strokeWidth="1" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="60s" repeatCount="indefinite" />
      </line>
    </svg>
  );
};

export default LokiLogo;
