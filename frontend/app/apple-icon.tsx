import { ImageResponse } from "next/og";

/*
 * Home-screen icon (iOS adds its own rounded mask, so the tile is drawn
 * full-bleed). Same mark as icon.svg: a plane climbing over a sea-glass
 * horizon on night navy. Static — no request-time APIs.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(180deg, #1b3a58 0%, #0b1a2c 100%)",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9bdac9" />
              <stop offset="1" stopColor="#3c9e89" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="92" r="52" fill="url(#sea)" />
          <g fill="#f3f6f9">
            <rect x="28.5" y="8" width="7" height="34" rx="3.5" />
            <path d="M32 19 L9 34 V39.5 L32 32.5 L55 39.5 V34 Z" />
            <path d="M32 35.5 L22.5 43 V46.5 L32 44 L41.5 46.5 V43 Z" />
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
