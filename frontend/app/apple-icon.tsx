import { ImageResponse } from "next/og";
import { CloudMarkShapes } from "@/components/ui/BrandMark";

/*
 * Home-screen icon (iOS adds its own rounded mask, so the tile is drawn
 * full-bleed). The Cloud9 mark with its face on night navy, scaled up a touch
 * like app/icon.svg so the cloud fills the tile. Static — no request-time APIs.
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
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(180deg, #1b3a58 0%, #0b1a2c 100%)",
        }}
      >
        <svg
          width="202"
          height="202"
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", left: -11, top: -11 }}
        >
          <CloudMarkShapes />
        </svg>
      </div>
    ),
    { ...size },
  );
}
