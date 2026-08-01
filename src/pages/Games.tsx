import { useState } from "react";
import { CalendarDays, CalendarPlus, History } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAccess } from "@/hooks/useAccess";
import { GameCard } from "@/components/GameCard";
import { EmptyState } from "@/components/EmptyState";
import { CreateBookingDialog } from "@/components/CreateBookingDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Game = {
  id: number;
  startsAt: Date | string;
};

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** Group games under "Month Year" headings, preserving the list's order. */
function groupByMonth<T extends Game>(games: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const g of games) {
    const label = monthLabel(new Date(g.startsAt));
    const bucket = groups.get(label);
    if (bucket) bucket.push(g);
    else groups.set(label, [g]);
  }
  return [...groups.entries()];
}

function MonthGroups<T extends Game>({ games, offset = 0 }: { games: T[]; offset?: number }) {
  let i = offset;
  return (
    <div className="space-y-6">
      {groupByMonth(games).map(([label, monthGames]) => (
        <section key={label}>
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">{label}</h2>
            <span className="text-xs text-muted-foreground">
              {monthGames.length} {monthGames.length === 1 ? "game" : "games"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {monthGames.map((g: any) => {
              const card = <GameCard key={g.id} game={g} index={i} />;
              i += 1;
              return card;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function Games() {
  const { isAdmin, isRoute } = useAccess();
  const canEdit = isAdmin || isRoute;
  const [bookingOpen, setBookingOpen] = useState(false);
  const { data: upcoming, isLoading: loadingUpcoming } = trpc.bookings.list.useQuery({
    scope: "upcoming",
    limit: 100,
  });
  const { data: past, isLoading: loadingPast } = trpc.bookings.list.useQuery({
    scope: "past",
    limit: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Games</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every session — played and scheduled, grouped by month. Past games are kept forever.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5" onClick={() => setBookingOpen(true)}>
            <CalendarPlus className="h-3.5 w-3.5" /> New booking
          </Button>
        )}
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Upcoming{upcoming ? ` · ${upcoming.length}` : ""}
          </TabsTrigger>
          <TabsTrigger value="past" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Played{past ? ` · ${past.length}` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-5">
          {loadingUpcoming ? (
            <GamesSkeleton />
          ) : !upcoming || upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No games scheduled"
              description={canEdit ? "Book the next session — the split starts automatically." : "Nothing scheduled yet — check back soon."}
              action={
                canEdit ? (
                  <Button size="sm" onClick={() => setBookingOpen(true)}>
                    <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> New booking
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <MonthGroups games={upcoming} />
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-5">
          {loadingPast ? (
            <GamesSkeleton />
          ) : !past || past.length === 0 ? (
            <EmptyState
              icon={History}
              title="No games played yet"
              description="Once a session's start time passes, it moves here with its full expense record."
            />
          ) : (
            <MonthGroups games={past} />
          )}
        </TabsContent>
      </Tabs>

      <CreateBookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}

function GamesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}
