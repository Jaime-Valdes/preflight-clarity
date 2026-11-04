import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { storageKind } from "./lib/db";
import { flights } from "./routes/flights";
import { responses } from "./routes/responses";
import { signups } from "./routes/signups";

export const app = new Hono();

// The admin key may arrive as ?key= (the GET routes); never let it reach the host's logs.
const redactKey = (line: string) => line.replace(/([?&]key=)[^&\s]*/gi, "$1[redacted]");
if (process.env.NODE_ENV !== "test") app.use("*", logger((line) => console.log(redactKey(line))));

// The web app normally reaches this API through its own same-origin proxy
// (see frontend/next.config.ts), so CORS only matters for direct calls.
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-admin-key"],
  }),
);

// Nothing is kept along the way (sessions, sign-ups, the admin lists) unless a route set its own
// policy: GET /flights/day answers with a short public max-age.
app.use("*", async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
});

app.get("/", (c) => c.json({ ok: true, service: "preflight-clarity-api" }));
app.get("/health", (c) => c.json({ ok: true, storage: storageKind() }));
app.route("/responses", responses);
app.route("/signups", signups);
app.route("/flights", flights);

app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ ok: false, error: "internal_error" }, 500);
});
