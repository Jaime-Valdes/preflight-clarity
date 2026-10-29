import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Page not found",
};

/** Unmatched /d/* URLs get version D's not-found page (app/d/not-found.tsx), not the study's. */
export default function Missing() {
  notFound();
}
