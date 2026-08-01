import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, KeyRound, Loader2, Route as RouteIcon, Server, ShieldCheck, Zap } from "lucide-react";
import { useAccess } from "@/hooks/useAccess";
import { cn } from "@/lib/utils";
import { getApiBase, isNativeApp, setApiBase } from "@/lib/mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Entry gate shown on every app open: Viewer (read-only), Admin (password)
 * or the Route mode (NARS squad — its own password, direct admin access).
 * In the native mobile app, a server address must be configured first.
 */
export function AccessGate() {
  const { chooseViewer, unlockAdmin, enterNars, unlocking } = useAccess();
  const [mode, setMode] = useState<"pick" | "admin" | "route">("pick");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const native = isNativeApp();
  const [serverUrl, setServerUrl] = useState(getApiBase() ?? "");
  const [serverEditing, setServerEditing] = useState(native && !getApiBase());

  const saveServer = () => {
    const trimmed = serverUrl.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+/.test(trimmed)) {
      setError("Enter a full address, e.g. https://courtsplit.example.com");
      return;
    }
    setApiBase(trimmed);
    // Reload so every query reconnects against the configured server.
    window.location.reload();
  };

  const submit = async () => {
    setError(null);
    try {
      if (mode === "admin") {
        await unlockAdmin(password);
      } else {
        await enterNars(password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Incorrect password.");
      setPassword("");
    }
  };

  if (native && serverEditing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Zap className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">CourtSplit</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Connect to your CourtSplit server
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <Server className="h-4 w-4 text-primary" />
              Server address
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              The app talks to the same backend as the website. Publish the web
              app, then paste its public URL here — you only do this once.
            </p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                saveServer();
              }}
            >
              <Input
                autoFocus
                type="url"
                inputMode="url"
                placeholder="https://your-courtsplit-url.com"
                value={serverUrl}
                onChange={(e) => {
                  setServerUrl(e.target.value);
                  setError(null);
                }}
                className={cn(error && "border-destructive")}
              />
              {error && <p className="text-xs font-medium text-destructive">{error}</p>}
              <div className="flex gap-2">
                {getApiBase() && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setServerEditing(false)}
                  >
                    Back
                  </Button>
                )}
                <Button type="submit" className="flex-1" disabled={!serverUrl.trim()}>
                  Connect
                </Button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-2xl"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">CourtSplit</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Badminton games, splits and settlements — how are you entering?
          </p>
        </div>

        {mode === "pick" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              onClick={() => void chooseViewer()}
              className="group rounded-xl border bg-card p-5 text-left transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <Eye className="mb-3 h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
              <p className="text-[15px] font-semibold">Viewer</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Browse games, balances and settlements. Read-only.
              </p>
            </button>
            <button
              onClick={() => setMode("admin")}
              className="group rounded-xl border bg-card p-5 text-left transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <ShieldCheck className="mb-3 h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
              <p className="text-[15px] font-semibold">Admin</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Full access — bookings, attendance, payments. Needs the password.
              </p>
            </button>
            <button
              onClick={() => setMode("route")}
              className="group rounded-xl border bg-card p-5 text-left transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <RouteIcon className="mb-3 h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
              <p className="text-[15px] font-semibold">Route</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Nidith
              </p>
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-xl border bg-card p-5">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              {mode === "admin" ? "Admin password" : "Route password"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === "admin"
                ? "Ask Nidith if you don't have it."
                : "Direct admin access for the 4-player squad — Nidith, Abhishek, Rahul, Sanjay."}
            </p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (password) void submit();
              }}
            >
              <Input
                autoFocus
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className={cn(error && "border-destructive")}
              />
              {error && <p className="text-xs font-medium text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setMode("pick");
                    setError(null);
                    setPassword("");
                  }}
                >
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={!password || unlocking}>
                  {unlocking && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {mode === "admin" ? "Unlock admin" : "Enter Route"}
                </Button>
              </div>
            </form>
          </div>
        )}
        {native && getApiBase() && (
          <button
            onClick={() => setServerEditing(true)}
            className="mx-auto mt-6 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Server className="h-3 w-3" />
            {getApiBase()}
          </button>
        )}
      </motion.div>
    </div>
  );
}
