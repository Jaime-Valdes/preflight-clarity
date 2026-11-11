/*
 * Which of the sky's four camera positions a /d page shows (docs/ui-d-cinematic.md, "The sky").
 * Plain data, no hooks, so a server component can ask too.
 */

/** home: first light. results: the climb. flight: above the clouds. compare: golden afternoon. */
export type DSkyScene = "home" | "results" | "flight" | "compare";

const trimmed = (pathname: string | null | undefined) => (pathname ?? "").replace(/\/+$/, "");

/** The scene for a pathname. Everything under /d that is not the home, a flight or the compare page is in the climb: results, not-found, a bad link. */
export function skySceneFor(pathname: string | null | undefined): DSkyScene {
  const path = trimmed(pathname);
  if (path === "/d") return "home";
  if (path === "/d/flight") return "flight";
  if (path === "/d/compare") return "compare";
  return "results";
}

/** Whether a pathname is one of the four pages a scene was framed for (anything else, such as not-found, borrows the climb with no card where its low clouds wait). */
export function skyFramesPage(pathname: string | null | undefined): boolean {
  const path = trimmed(pathname);
  return path === "/d" || path === "/d/search" || path === "/d/flight" || path === "/d/compare";
}
