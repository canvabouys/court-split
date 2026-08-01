import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  index = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "good" | "warn";
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
    >
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                tone === "good" && "bg-primary/10 text-primary",
                tone === "warn" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                tone === "default" && "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
          </div>
          <p
            className={cn(
              "mt-2 text-2xl font-bold tabular tracking-tight",
              tone === "good" && "text-primary",
              tone === "warn" && "text-amber-600 dark:text-amber-400",
            )}
          >
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}
