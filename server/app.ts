import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";

/**
 * The CourtSplit HTTP app. This module only *builds* the app — starting a
 * listener (self-host) happens in boot.ts, and the Vercel serverless
 * adapter lives in /api/[...path].ts. Both reuse this same app, so the
 * API behaves identically on every platform.
 */
const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// CORS for the native mobile app — its origin (https://localhost or
// capacitor://localhost) is cross-site, so the API must explicitly allow it
// (with credentials, since access is cookie-based).
const NATIVE_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
]);
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("origin");
  const allowed = origin && NATIVE_ORIGINS.has(origin);
  if (allowed && c.req.method === "OPTIONS") {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res.headers.set(
      "Access-Control-Allow-Headers",
      c.req.header("access-control-request-headers") ?? "content-type",
    );
    c.res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    c.res.headers.set("Vary", "Origin");
    return c.body(null, 204);
  }
  await next();
  if (allowed) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res.headers.append("Vary", "Origin");
  }
});

app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;
