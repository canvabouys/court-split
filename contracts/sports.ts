export interface SportMeta {
  label: string;
  emoji: string;
  unit: string; // what gets booked
  venues: string[];
}

export const SPORTS: Record<string, SportMeta> = {
  Badminton: {
    label: "Badminton",
    emoji: "🏸",
    unit: "court",
    venues: ["PlayArena Sports Hub", "SmashZone Indoor Arena", "Feather Flight Academy", "Court Kings"],
  },
};

export const SPORT_NAMES = Object.keys(SPORTS);

export function sportEmoji(sport: string): string {
  return SPORTS[sport]?.emoji ?? "🏸";
}
