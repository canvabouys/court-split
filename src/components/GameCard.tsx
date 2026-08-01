import { Link } from "react-router";
import { motion } from "framer-motion";
import { ChevronRight, MapPin, Users } from "lucide-react";
import { sportEmoji } from "@contracts/sports";
import { formatINR } from "@contracts/money";
import { gameDayLabel, gameTimeLabel, durationLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface GameCardData {
  id: number;
  sport: string;
  venue: string;
  startsAt: Date;
  durationMin: number;
  costPaise: number;
  status: string;
  group?: { id: number; name: string; emoji: string };
  attendeeCount: number;
  iAttend?: boolean;
}

export function GameCard({ game, index = 0 }: { game: GameCardData; index?: number }) {
  const starts = new Date(game.startsAt);
  const isPlayed = game.status === "played";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
    >
      <Link
        to={`/bookings/${game.id}`}
        className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-xl">
          {sportEmoji(game.sport)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{game.venue}</p>
            {isPlayed ? (
              <Badge variant="secondary" className="text-[10px]">Played</Badge>
            ) : (
              <Badge className="bg-primary/10 text-[10px] text-primary hover:bg-primary/10">
                Upcoming
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {gameDayLabel(starts)} · {gameTimeLabel(starts)}
            </span>
            {game.group && (
              <span className="hidden items-center gap-1 sm:flex">
                <MapPin className="h-3 w-3" /> {game.group.emoji} {game.group.name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {game.attendeeCount}
            </span>
            <span>{durationLabel(game.durationMin)}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular">{formatINR(game.costPaise)}</p>
          <p className="text-[11px] text-muted-foreground">total</p>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5",
          )}
        />
      </Link>
    </motion.div>
  );
}
