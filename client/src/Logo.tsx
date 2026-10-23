import { Link } from "react-router";

/** App mark plus name; links home. */
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Whiteboard home">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#1e1e1e" />
        <path
          d="M7 20c3-7 6-9 8-5s4 4 6-1 3-3 4 0"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="logo-name">Whiteboard</span>
    </Link>
  );
}
