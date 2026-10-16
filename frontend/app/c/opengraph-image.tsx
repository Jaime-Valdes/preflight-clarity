import { ImageResponse } from "next/og";

/*
 * Link-preview image for version C (/c and its pages). Static: no request-time
 * APIs, no network, no local assets — rendered once with the font bundled in
 * next/og. Same artwork language as the study's image (app/opengraph-image.tsx):
 * night navy into sea-glass teal, the horizon rising at the bottom, the app
 * mark; here with two calm flight cards side by side on the right.
 */

export const alt =
  "Pre-Flight Clarity: compare flights side by side. Two illustrative nonstop flight cards with departure and arrival times, fares and smoothness scores; the turbulence forecast comes out 2 days before departure. Prototype with illustrative data, nothing can be booked.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#0b1a2c";
const NIGHT = "#10243a";
const NIGHT_LIGHT = "#1b3a58";
const TEAL_DEEP = "#1f5149";
const TEAL = "#3c9e89";
const TEAL_SOFT = "#85cdbb";
const CALM_100 = "#d5efe8";
const CANVAS = "#f3f6f9";
const INK_900 = "#0e1a2b";
const INK_500 = "#5b6b7f";
const LINE = "#e3e9f0";

/** The same plane silhouette as icon.svg, in its 64-unit coordinate space. */
function Plane({ size: px, fill = CANVAS }: { size: number; fill?: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <g fill={fill}>
        <rect x="28.5" y="8" width="7" height="34" rx="3.5" />
        <path d="M32 19 L9 34 V39.5 L32 32.5 L55 39.5 V34 Z" />
        <path d="M32 35.5 L22.5 43 V46.5 L32 44 L41.5 46.5 V43 Z" />
      </g>
    </svg>
  );
}

/** A small calm ring (like the results' score badge). */
function Ring({ value }: { value: number }) {
  const px = 64;
  const stroke = 6;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} style={{ position: "absolute", left: 0, top: 0, transform: "rotate(-90deg)" }}>
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="#d5efe8" strokeWidth={stroke} />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke={TEAL}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`}
        />
      </svg>
      <div style={{ fontSize: 22, color: INK_900, display: "flex" }}>{value}</div>
    </div>
  );
}

function FlightCard({
  code,
  tile,
  depart,
  arrive,
  fare,
  score,
  offset = 0,
}: {
  code: string;
  tile: string;
  depart: string;
  arrive: string;
  fare: string;
  score: number;
  offset?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 340,
        padding: "22px 24px",
        borderRadius: 28,
        background: "#ffffff",
        boxShadow: "0 30px 60px -28px rgba(0,0,0,0.55)",
        marginLeft: offset,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              background: tile,
              color: "#ffffff",
              fontSize: 17,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {code}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 22, color: INK_900, display: "flex" }}>
              {depart} → {arrive}
            </div>
            <div style={{ fontSize: 16, color: INK_500, display: "flex", marginTop: 2 }}>Nonstop</div>
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 18,
          paddingTop: 16,
          borderTop: `2px solid ${LINE}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Ring value={score} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 18, color: INK_900, display: "flex" }}>Smoothness</div>
            <div style={{ fontSize: 15, color: INK_500, display: "flex" }}>turbulence forecast</div>
          </div>
        </div>
        <div style={{ fontSize: 30, color: INK_900, display: "flex" }}>{fare}</div>
      </div>
    </div>
  );
}

export default function CompareOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(150deg, ${NAVY} 0%, ${NIGHT} 38%, ${NIGHT_LIGHT} 64%, ${TEAL_DEEP} 100%)`,
          fontFamily: "Geist, sans-serif",
          color: "#ffffff",
        }}
      >
        {/* Soft teal glow behind the cards. */}
        <div
          style={{
            position: "absolute",
            left: 560,
            top: 120,
            width: 900,
            height: 600,
            borderRadius: 9999,
            background: `radial-gradient(circle at center, ${TEAL}55 0%, ${TEAL}1f 42%, ${NAVY}00 70%)`,
          }}
        />

        {/* The earth's horizon, as in the study's image. */}
        <div
          style={{
            position: "absolute",
            left: -600,
            top: 520,
            width: 2400,
            height: 2400,
            borderRadius: 9999,
            background: `linear-gradient(180deg, ${TEAL_SOFT} 0%, ${TEAL} 1.2%, ${TEAL_DEEP} 4%, ${NIGHT} 9%)`,
            opacity: 0.95,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -600,
            top: 517,
            width: 2400,
            height: 2400,
            borderRadius: 9999,
            border: `3px solid ${CALM_100}`,
            opacity: 0.5,
          }}
        />

        {/* Two flights side by side. */}
        <div
          style={{
            position: "absolute",
            right: 70,
            top: 92,
            display: "flex",
            flexDirection: "column",
            gap: 22,
          }}
        >
          <FlightCard code="AA" tile={NIGHT_LIGHT} depart="8:05 AM" arrive="11:24 AM" fare="$214" score={92} />
          <FlightCard code="DL" tile={TEAL} depart="9:40 AM" arrive="1:02 PM" fare="$189" score={86} offset={-36} />
        </div>

        {/* Text block. */}
        <div
          style={{
            position: "absolute",
            left: 80,
            top: 76,
            display: "flex",
            flexDirection: "column",
            width: 620,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                position: "relative",
                background: `linear-gradient(180deg, ${NIGHT_LIGHT} 0%, ${NAVY} 100%)`,
                border: "1.5px solid rgba(255,255,255,0.16)",
                boxShadow: "0 18px 40px -16px rgba(0,0,0,0.6)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: -24,
                  top: 48,
                  width: 124,
                  height: 124,
                  borderRadius: 9999,
                  background: `linear-gradient(180deg, #9bdac9 0%, ${TEAL} 100%)`,
                }}
              />
              <Plane size={72} />
            </div>
            <div style={{ fontSize: 30, letterSpacing: 6, color: CALM_100, opacity: 0.85, display: "flex" }}>
              PRE-FLIGHT CLARITY
            </div>
          </div>

          <div
            style={{
              marginTop: 54,
              fontSize: 74,
              lineHeight: 1.04,
              letterSpacing: -2.5,
              color: "#ffffff",
              display: "flex",
            }}
          >
            Compare flights side by side
          </div>

          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              lineHeight: 1.36,
              color: CALM_100,
              opacity: 0.92,
              display: "flex",
            }}
          >
            Times, fares, aircraft and airline, plus the turbulence forecast from 2 days out.
          </div>
        </div>

        {/* Quiet footer line. */}
        <div
          style={{
            position: "absolute",
            left: 80,
            bottom: 40,
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            color: "#ffffff",
            opacity: 0.72,
          }}
        >
          <div style={{ display: "flex" }}>Prototype</div>
          <div style={{ width: 6, height: 6, borderRadius: 9999, background: CALM_100, opacity: 0.7 }} />
          <div style={{ display: "flex" }}>Illustrative flights and prices</div>
          <div style={{ width: 6, height: 6, borderRadius: 9999, background: CALM_100, opacity: 0.7 }} />
          <div style={{ display: "flex" }}>Nothing can be booked</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
