import { useState } from "react";

const COLORS = ["#e03131", "#f08c00", "#2f9e44", "#1971c2", "#7048e8", "#e64980", "#0c8599", "#5c940d"];

/** Same name, same color, on every screen. */
function colorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

function initials(name: string): string {
  const words = name.replace(/^Guest\s+/i, "").split(" ").filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

type Props = { name: string; avatarUrl: string | null; size?: number; ring?: boolean };

/** Profile picture, or colored initials when there isn't one (or it fails to load). */
export function Avatar({ name, avatarUrl, size = 28, ring = false }: Props) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  const className = `avatar${ring ? " avatar-ring" : ""}`;

  if (avatarUrl && !broken) {
    return (
      <img
        className={className}
        style={style}
        src={avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={className} style={{ ...style, background: colorFor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
