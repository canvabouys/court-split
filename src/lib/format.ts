import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from "date-fns";

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function gameDayLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, d MMM");
}

export function gameTimeLabel(d: Date): string {
  return format(d, "h:mm a");
}

export function fullDateLabel(d: Date): string {
  return format(d, "EEEE, d MMMM yyyy");
}

export function timeAgo(d: Date): string {
  return formatDistanceToNow(d, { addSuffix: true });
}

export function durationLabel(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const AVATAR_HUES = [161, 200, 222, 262, 288, 18, 36, 340];
export function avatarHue(seed: number | string): number {
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}
