import { formatINR } from "@contracts/money";
import { cn } from "@/lib/utils";

/** Signed money: positive (owed to you) = primary, negative (you owe) = amber/red-ish. */
export function Money({
  paise,
  signed = false,
  className,
}: {
  paise: number;
  signed?: boolean;
  className?: string;
}) {
  if (signed) {
    if (paise > 0)
      return (
        <span className={cn("tabular font-semibold text-primary", className)}>
          +{formatINR(paise)}
        </span>
      );
    if (paise < 0)
      return (
        <span className={cn("tabular font-semibold text-amber-600 dark:text-amber-400", className)}>
          −{formatINR(-paise)}
        </span>
      );
    return (
      <span className={cn("tabular font-medium text-muted-foreground", className)}>
        {formatINR(0)}
      </span>
    );
  }
  return <span className={cn("tabular font-semibold", className)}>{formatINR(paise)}</span>;
}
