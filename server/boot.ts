import { env } from "./lib/env";
import app from "./app";

/**
 * Self-hosting entry point (VPS / Railway / Render / Docker):
 * serves the built frontend from dist/public and starts a Node listener.
 * Not used on Vercel — see /api/[...path].ts.
 */
export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
