import { notFound } from "next/navigation";

/** Unmatched /c/* URLs get version C's not-found page (app/c/not-found.tsx), not the study's. */
export default function Missing() {
  notFound();
}
