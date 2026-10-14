import type { Metadata } from "next";
import { PreviewClient } from "@/components/dashboard/PreviewClient";

export const metadata: Metadata = {
  title: "Preview",
};

/**
 * /preview?origin=JFK&destination=LAX&date=2026-11-26&v=A — team demo of the
 * dashboard alone (all params optional). The page is static; the client reads
 * the query string, generates the flight and saves nothing.
 */
export default function PreviewPage() {
  return <PreviewClient />;
}
