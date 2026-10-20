// Vercel Function for the whole API (see src/vercel.ts). Built by `npm run build -w backend`
// (tsup bundles the app and shared/ into dist/); vercel.json sends every path here.
import { handler } from "../dist/vercel.js";

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
export const HEAD = handler;
