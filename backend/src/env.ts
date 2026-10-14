/*
 * Loads backend/.env for local development (Node ≥ 20.12). Hosting platforms
 * (Railway, Render, Fly, Vercel…) inject environment variables directly, so a
 * missing file is fine. Imported first from index.ts so every other module
 * sees the variables at load time.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — nothing to load
}
