import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { storageKind } from "./lib/db";
import { responses } from "./routes/responses";

export const app = new Hono();

// The admin key may arrive as ?key= (routes/responses.ts); never let it reach the host's logs.
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

app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

app.get("/", (c) => c.json({ ok: true, service: "preflight-clarity-api" }));
app.get("/health", (c) => c.json({ ok: true, storage: storageKind() }));
app.route("/responses", responses);

app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ ok: false, error: "internal_error" }, 500);
});
