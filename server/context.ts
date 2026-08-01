import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { getLocalUser } from "./lib/workspace";
import { isAdminRequest, workspaceModeOf, type WorkspaceMode } from "./lib/access";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  /** True when the visitor unlocked admin mode with the password. */
  isAdmin?: boolean;
  /** Which workspace the request is scoped to: the crew or the NARS "Route". */
  wsMode?: WorkspaceMode;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = {
    req: opts.req,
    resHeaders: opts.resHeaders,
    isAdmin: isAdminRequest(opts.req),
    wsMode: workspaceModeOf(opts.req),
  };
  try {
    // Single-player mode: every request acts as the local workspace owner.
    ctx.user = await getLocalUser();
  } catch {
    // Database not ready yet — procedures will surface the error.
  }
  return ctx;
}
