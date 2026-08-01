import { trpc } from "@/providers/trpc";
import { useMemo } from "react";

/**
 * CourtSplit runs as a single local workspace — no login.
 * This hook returns the workspace owner ("you").
 */
export function useAuth() {
  const {
    data: user,
    isLoading,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  return useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated: !!user,
      isLoading,
      refresh: refetch,
    }),
    [user, isLoading, refetch],
  );
}
