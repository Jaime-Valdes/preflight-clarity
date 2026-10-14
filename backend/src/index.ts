import "./env";
import { serve } from "@hono/node-server";
import { app } from "./app";
import { storageKind } from "./lib/db";

const port = Number(process.env.PORT) || 8787;

serve({ fetch: app.fetch, port }, (info) => {
  const storage = storageKind();
  console.log(`Pre-Flight Clarity API listening on http://localhost:${info.port} (storage: ${storage})`);
  if (storage !== "supabase") {
    console.warn(
      storage === "file"
        ? "Sessions are being written to a local JSON file. Fine for development — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the real study."
        : "No storage configured: sessions will not be saved. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or DATA_FILE for a local file).",
    );
  }
});
