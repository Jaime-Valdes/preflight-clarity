import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const SHARE_TITLE = "Pre-Flight Clarity · A 5-minute study for nervous flyers";
const DESCRIPTION =
  "Explore a detailed briefing for an upcoming flight, then tell us how it feels. Takes about 5 minutes on your phone. All flight data is illustrative.";

/**
 * Base URL for absolute social-image URLs. On Vercel, Next.js derives it from
 * VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL automatically, so this is only
 * needed on other hosts (NEXT_PUBLIC_SITE_URL, see .env.example).
 */
/** Absolute base for the link-preview image: NEXT_PUBLIC_SITE_URL, else the Vercel production domain. */
function siteBaseUrl(): URL | undefined {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const raw = process.env.NEXT_PUBLIC_SITE_URL || (vercel ? `https://${vercel}` : undefined);
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: siteBaseUrl(),
  title: { default: "Pre-Flight Clarity", template: "%s · Pre-Flight Clarity" },
  description: DESCRIPTION,
  applicationName: "Pre-Flight Clarity",
  appleWebApp: { title: "Pre-Flight Clarity" },
  // The link-preview image comes from app/opengraph-image.tsx (and twitter-image.tsx).
  openGraph: {
    type: "website",
    siteName: "Pre-Flight Clarity",
    locale: "en_US",
    title: SHARE_TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: DESCRIPTION,
  },
  // Research prototype: keep it out of search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f6f9",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink-900">{children}</body>
    </html>
  );
}
