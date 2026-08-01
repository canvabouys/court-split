import { useCallback, useSyncExternalStore } from "react";
import { trpc } from "@/providers/trpc";

export type Choice = "viewer" | "admin" | "nars";
export type WorkspaceMode = "crew" | "nars";

/**
 * Access state lives ONLY in memory — nothing is written to localStorage or
 * any persistent store, and the server's cookies are session cookies. So the
 * Viewer / Admin / Route gate is shown again every time the app is opened.
 */
let currentChoice: Choice | null = null;
const listeners = new Set<() => void>();

function setChoiceStore(c: Choice | null) {
  currentChoice = c;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getChoice(): Choice | null {
  return currentChoice;
}

export function useAccess() {
  const utils = trpc.useUtils();
  const status = trpc.access.status.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  });
  const choice = useSyncExternalStore(subscribe, getChoice);

  const unlock = trpc.access.unlock.useMutation();
  const enterNarsMut = trpc.access.enterNars.useMutation();
  const lockMutation = trpc.access.lock.useMutation();

  const mode: WorkspaceMode = status.data?.mode === "nars" ? "nars" : "crew";
  const isRoute = choice === "nars" || mode === "nars";
  const serverAdmin = status.data?.role === "admin";
  const isAdmin = choice === "nars" || (choice === "admin" && serverAdmin);

  const afterChange = useCallback(async () => {
    await status.refetch();
    await utils.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.refetch, utils]);

  /** Enter as a read-only viewer (also drops any stale session cookies). */
  const chooseViewer = useCallback(async () => {
    setChoiceStore("viewer");
    try {
      await lockMutation.mutateAsync();
    } catch {
      /* no cookies to clear */
    }
    await afterChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockMutation.mutateAsync, afterChange]);

  /** Enter as admin of the crew workspace — requires the site password. */
  const unlockAdmin = useCallback(
    async (password: string) => {
      await unlock.mutateAsync({ password });
      setChoiceStore("admin");
      await afterChange();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unlock.mutateAsync, afterChange],
  );

  /** Enter the "Route" (NARS) mode — its own password, direct admin access. */
  const enterNars = useCallback(
    async (password: string) => {
      await enterNarsMut.mutateAsync({ password });
      setChoiceStore("nars");
      await afterChange();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enterNarsMut.mutateAsync, afterChange],
  );

  /** Back to the gate — clears the in-memory choice and all session cookies. */
  const resetChoice = useCallback(async () => {
    setChoiceStore(null);
    try {
      await lockMutation.mutateAsync();
    } catch {
      /* already locked */
    }
    await utils.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockMutation.mutateAsync, utils]);

  return {
    mode,
    isRoute,
    isAdmin,
    isLoading: status.isLoading,
    /** Whether the visitor has answered the entry gate this session. */
    hasChosen: choice !== null,
    chooseViewer,
    unlockAdmin,
    enterNars,
    resetChoice,
    unlocking: unlock.isPending || enterNarsMut.isPending,
  };
}
