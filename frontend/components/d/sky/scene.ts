/*
 * Which of the sky's four camera positions a /d page shows (docs/ui-d-cinematic.md, "The sky").
 * Plain data, no hooks, so a server component can ask too.
 */

/** home: first light. results: the climb. flight: above the clouds. compare: golden afternoon. */
export type DSkyScene = "home" | "results" | "flight" | "compare";

/** The scene for a pathname. Everything under /d that is not the home, a flight or the compare page is in the climb: results, not-found, a bad link. */
export function skySceneFor(pathname: string | null | undefined): DSkyScene {
  const path = (pathname ?? "").replace(/\/+$/, "");
  if (path === "/d") return "home";
  if (path === "/d/flight") return "flight";
  if (path === "/d/compare") return "compare";
  return "results";
}
