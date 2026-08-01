import { createHmac, timingSafeEqual } from "crypto";
import * as cookie from "cookie";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../context";
import { getSessionCookieOptions } from "./cookies";
import { env } from "./env";

/**
 * CourtSplit access control: the site is world-readable, but only the admin
 * can change anything. The admin unlocks with a password; the server then
 * issues an HMAC-signed httpOnly SESSION cookie (no max-age — it lives only
 * until the browser closes, and nothing is persisted to disk).
 *
 * A second entry mode, "Route" (NARS), is a private 4-player workspace with
 * its own password; entering it grants direct admin access in that workspace.
 */

export const ADMIN_PASSWORD = "Nidith@2002";
export const NARS_PASSWORD = "NARS@2002";
export const ADMIN_COOKIE = "cs_admin";
export const WS_COOKIE = "cs_ws";

export type WorkspaceMode = "crew" | "nars";

function secret(): string {
  return env.appSecret || "courtsplit-local-access-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createAdminToken(): string {
  const payload = `admin.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function parseCookies(req: Request): Record<string, string | undefined> {
  const raw = req.headers.get("cookie");
  return raw ? cookie.parse(raw) : {};
}

/** Extract + verify the admin cookie from a request. */
export function isAdminRequest(req: Request): boolean {
  return verifyAdminToken(parseCookies(req)[ADMIN_COOKIE]);
}

/** Which workspace the request is scoped to ("Route" mode = NARS squad). */
export function workspaceModeOf(req: Request): WorkspaceMode {
  return parseCookies(req)[WS_COOKIE] === "nars" ? "nars" : "crew";
}

function serializeSessionCookie(
  ctx: TrpcContext,
  name: string,
  value: string,
  maxAge?: number,
) {
  const opts = getSessionCookieOptions(ctx.req.headers);
  ctx.resHeaders.append(
    "set-cookie",
    cookie.serialize(name, value, {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      // No maxAge → session cookie, cleared when the browser closes.
      ...(maxAge !== undefined ? { maxAge } : {}),
    }),
  );
}

export function setAdminCookie(ctx: TrpcContext) {
  serializeSessionCookie(ctx, ADMIN_COOKIE, createAdminToken());
}

export function clearAdminCookie(ctx: TrpcContext) {
  serializeSessionCookie(ctx, ADMIN_COOKIE, "", 0);
}

export function setWorkspaceCookie(ctx: TrpcContext, mode: WorkspaceMode) {
  serializeSessionCookie(ctx, WS_COOKIE, mode);
}

export function clearWorkspaceCookie(ctx: TrpcContext) {
  serializeSessionCookie(ctx, WS_COOKIE, "", 0);
}

/** Throw unless the current session is the unlocked admin. Call in every mutation. */
export function requireAdmin(ctx: TrpcContext): void {
  if (!ctx.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Read-only access — only the admin can make changes.",
    });
  }
}
