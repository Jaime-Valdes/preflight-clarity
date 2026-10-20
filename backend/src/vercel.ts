/*
 * Vercel entry: the same Hono app as a Web-standard handler (Request → Response).
 * backend/api/index.js re-exports it as a Vercel Function, and backend/vercel.json
 * rewrites every path to that function. The routes are mounted at "/" and at
 * "/api", so they match whichever path the platform passes through.
 */
import "./env";
import { Hono } from "hono";
import { app } from "./app";

const root = new Hono();
root.route("/api", app);
root.route("/", app);

export function handler(request: Request): Response | Promise<Response> {
  return root.fetch(request);
}
