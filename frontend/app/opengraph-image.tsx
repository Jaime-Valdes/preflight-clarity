import { ImageResponse } from "next/og";
import { CloudMarkShapes } from "@/components/ui/BrandMark";

/*
 * Link-preview image (iMessage, WhatsApp, Slack, X…). Static: no request-time
 * APIs, no network, no local assets — it renders with the font bundled in
 * next/og, so it is generated once at build time and cached.
 *
 * Design: deep night navy fading into sea-glass teal, the earth's horizon
 * rising at the bottom, the Cloud9 mark floating above it, and three calm
 * lines of text. Mirrors the colours in app/globals.css.
 */

export const alt =
  "Cloud9 — a 5–10 minute study for nervous flyers. Student research prototype.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#0b1a2c";
const NIGHT = "#10243a";
const NIGHT_LIGHT = "#1b3a58";
const TEAL_DEEP = "#1f5149";
const TEAL = "#3c9e89";
const TEAL_SOFT = "#85cdbb";
const CALM_100 = "#d5efe8";

export default function OpenGraphImage() {
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
        {/* Soft teal glow low on the right, where the horizon will rise. */}
        <div
          style={{
            position: "absolute",
            left: 520,
            top: 250,
            width: 900,
            height: 600,
            borderRadius: 9999,
            background: `radial-gradient(circle at center, ${TEAL}66 0%, ${TEAL}22 42%, ${NAVY}00 70%)`,
          }}
        />

        {/* The earth's horizon: a very large circle whose top edge curves gently across the bottom,
            glowing sea-glass at the rim and fading back into the night below. */}
        <div
          style={{
            position: "absolute",
            left: -600,
            top: 492,
            width: 2400,
            height: 2400,
            borderRadius: 9999,
            background: `linear-gradient(180deg, ${TEAL_SOFT} 0%, ${TEAL} 1.2%, ${TEAL_DEEP} 4%, ${NIGHT} 9%)`,
            opacity: 0.95,
          }}
        />
        {/* A thin bright rim along the horizon line. */}
        <div
          style={{
            position: "absolute",
            left: -600,
            top: 489,
            width: 2400,
            height: 2400,
            borderRadius: 9999,
            border: `3px solid ${CALM_100}`,
            opacity: 0.5,
          }}
        />

        {/* The Cloud9 mark floating above the horizon on the right. */}
        <div style={{ position: "absolute", right: 96, top: 128, display: "flex" }}>
          <svg width="320" height="320" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <CloudMarkShapes />
          </svg>
        </div>

        {/* Text block. */}
        <div
          style={{
            position: "absolute",
            left: 80,
            top: 76,
            display: "flex",
            flexDirection: "column",
            width: 760,
          }}
        >
          {/* Brand lockup: the app icon tile and name. */}
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
              <svg
                width="84"
                height="84"
                viewBox="0 0 64 64"
                xmlns="http://www.w3.org/2000/svg"
                style={{ position: "absolute", left: -4, top: -4 }}
              >
                <CloudMarkShapes />
              </svg>
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: -0.5,
                color: CALM_100,
                opacity: 0.9,
              }}
            >
              Cloud9
            </div>
          </div>

          <div
            style={{
              marginTop: 54,
              fontSize: 78,
              lineHeight: 1.02,
              letterSpacing: -2.5,
              color: "#ffffff",
            }}
          >
            A 5–10 minute study for nervous flyers
          </div>

          <div
            style={{
              marginTop: 30,
              fontSize: 32,
              lineHeight: 1.35,
              color: CALM_100,
              opacity: 0.92,
            }}
          >
            Explore a detailed briefing for an upcoming flight, then tell us how it feels.
          </div>
        </div>

        {/* Quiet footer line. */}
        <div
          style={{
            position: "absolute",
            left: 80,
            bottom: 58,
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            color: "#ffffff",
            opacity: 0.72,
          }}
        >
          <div style={{ display: "flex" }}>Student research prototype</div>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: CALM_100,
              opacity: 0.7,
            }}
          />
          <div style={{ display: "flex" }}>All flight data is illustrative</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
