import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const HOLD_MS = 1600;
const FADE_MS = 500;

/**
 * One-shot launch splash — plays a short "developed by Nidith"
 * animation every time the app is opened, then fades away.
 */
export function SplashScreen() {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), HOLD_MS);
    const t2 = setTimeout(() => setGone(true), HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background transition-opacity duration-500",
        fading && "opacity-0",
      )}
    >
      <div className="splash-logo flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
        <Zap className="h-8 w-8" fill="currentColor" />
      </div>
      <p className="splash-title mt-5 text-2xl font-bold tracking-tight">
        CourtSplit
      </p>
      <p className="splash-byline mt-2 text-sm text-muted-foreground">
        developed by <span className="font-semibold text-foreground">Nidith</span>
      </p>
    </div>
  );
}
