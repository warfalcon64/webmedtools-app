// Line icons drawn at 24 x 24 in the current text colour. `className` sets their size.
type IconProps = { className?: string };

const line = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function EyeIcon({ className }: IconProps) {
  return (
    <svg {...line} className={className}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg {...line} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg {...line} className={className}>
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
    </svg>
  );
}

/** The site's mark, as in app/icon.svg: a pulse whose peaks form a W, on the two button colours. */
export function MarkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="mark-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-button)" />
          <stop offset="1" stopColor="var(--color-button-second)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#mark-gradient)" />
      <path
        d="M5.5 15h3l2.4 6.5 5.1-11 5.1 11 2.4-6.5h3"
        fill="none"
        stroke="#fff"
        strokeWidth={2.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const toolIcons = { eye: EyeIcon };
