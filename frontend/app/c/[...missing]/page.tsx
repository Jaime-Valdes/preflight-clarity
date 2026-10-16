import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Page not found",
};

/** Unmatched /c/* URLs get version C's not-found page (app/c/not-found.tsx), not the study's. */
export default function Missing() {
  notFound();
}
