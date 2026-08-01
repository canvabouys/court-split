import { handle } from "@hono/node-server/vercel";
import app from "../server/app";

/**
 * Vercel Serverless Function (Node.js runtime).
 * The catch-all segment [...path] matches every request under /api/*
 * with the original URL preserved, so Hono routes /api/trpc/* exactly
 * the same as on a self-hosted server.
 */
export default handle(app);
