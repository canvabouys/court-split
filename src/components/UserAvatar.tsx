import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarHue, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  src,
  seed,
  className,
}: {
  name?: string | null;
  src?: string | null;
  seed?: number | string;
  className?: string;
}) {
  const hue = avatarHue(seed ?? name ?? "?");
  return (
    <Avatar className={cn("h-8 w-8 border border-border/60", className)}>
      {src ? <AvatarImage src={src} alt={name ?? "avatar"} /> : null}
      <AvatarFallback
        className="text-[11px] font-semibold"
        style={{
          backgroundColor: `hsl(${hue} 45% 92%)`,
          color: `hsl(${hue} 55% 30%)`,
        }}
      >
        <span className="dark:brightness-125">{initials(name)}</span>
      </AvatarFallback>
    </Avatar>
  );
}

export function GroupAvatar({
  emoji,
  className,
}: {
  emoji: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/60 text-lg",
        className,
      )}
    >
      {emoji}
    </div>
  );
}
