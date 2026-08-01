import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import {
  ADMIN_PASSWORD,
  NARS_PASSWORD,
  clearAdminCookie,
  clearWorkspaceCookie,
  setAdminCookie,
  setWorkspaceCookie,
} from "../lib/access";
import { getWorkspace } from "../lib/workspace";

export const accessRouter = createRouter({
  /** Current access level + workspace for this session. */
  status: authedQuery.query(({ ctx }) => ({
    role: (ctx.isAdmin ? "admin" : "viewer") as "admin" | "viewer",
    mode: (ctx.wsMode ?? "crew") as "crew" | "nars",
  })),

  /** Viewer → admin: requires the site password. Sets a session cookie. */
  unlock: authedQuery
    .input(z.object({ password: z.string().max(100) }))
    .mutation(({ ctx, input }) => {
      if (input.password !== ADMIN_PASSWORD) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password." });
      }
      clearWorkspaceCookie(ctx);
      setAdminCookie(ctx);
      return { ok: true };
    }),

  /** Enter the "Route" (NARS) mode: its own password, direct admin access. */
  enterNars: authedQuery
    .input(z.object({ password: z.string().max(100) }))
    .mutation(async ({ ctx, input }) => {
      if (input.password !== NARS_PASSWORD) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password." });
      }
      // Provision the 4-player workspace on first entry.
      await getWorkspace("nars");
      setWorkspaceCookie(ctx, "nars");
      setAdminCookie(ctx);
      return { ok: true };
    }),

  /** Drop every access cookie — back to the gate. */
  lock: authedQuery.mutation(({ ctx }) => {
    clearAdminCookie(ctx);
    clearWorkspaceCookie(ctx);
    return { ok: true };
  }),
});
