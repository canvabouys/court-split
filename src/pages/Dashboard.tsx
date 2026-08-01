import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { formatINR, formatINRCompact } from "@contracts/money";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/hooks/useAccess";
import { fullDateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/StatCard";
import { GameCard } from "@/components/GameCard";
import { EmptyState } from "@/components/EmptyState";
import { CreateBookingDialog } from "@/components/CreateBookingDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { user } = useAuth();
  const { isAdmin, isRoute } = useAccess();
  const { data, isLoading } = trpc.dashboard.summary.useQuery();
  const [bookingOpen, setBookingOpen] = useState(false);

  const canEdit = isAdmin || isRoute;

  const utils = trpc.useUtils();
  const seedDemo = trpc.demo.seed.useMutation({
    onSuccess: async () => {
      toast.success("Demo data loaded", {
        description: "A season of badminton games with real-looking splits and settlements.",
      });
      await utils.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const isFresh = (data?.totalGames ?? 0) === 0;

  if (isFresh) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg text-center"
        >
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
            🏸
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to CourtSplit, {firstName}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Book a court, mark who played, and CourtSplit works out who owes whom — with the
            fewest possible payments.
          </p>
          {canEdit ? (
            <>
              <div className={cn("mt-8 grid gap-3", !isRoute && "sm:grid-cols-2")}>
                <Button size="lg" className="gap-2" onClick={() => setBookingOpen(true)}>
                  <CalendarPlus className="h-4 w-4" /> Book your first game
                </Button>
                {!isRoute && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="gap-2"
                    disabled={seedDemo.isPending}
                    onClick={() => seedDemo.mutate()}
                  >
                    <Sparkles className="h-4 w-4" />
                    {seedDemo.isPending ? "Loading…" : "Try demo data"}
                  </Button>
                )}
              </div>
              {!isRoute && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Demo data seeds a season of badminton with the crew — Abhishek, Sanjay, Rahul,
                  Hari Prasad, Bhuvan, Kushal and Yashwanth — so you can explore every feature.
                </p>
              )}
              {isRoute && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Route mode — splits stay between Nidith, Abhishek, Rahul and Sanjay.
                </p>
              )}
            </>
          ) : (
            <p className="mt-8 text-sm text-muted-foreground">
              No games yet — check back once the admin books the first session.
            </p>
          )}
        </motion.div>
        <CreateBookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted-foreground">{fullDateLabel(new Date())}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {greeting()}, {firstName}
          </h1>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setBookingOpen(true)}>
              <CalendarPlus className="h-3.5 w-3.5" /> New booking
            </Button>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          index={0}
          label="You owe"
          value={formatINR(data!.youOwePaise)}
          hint={data!.youOwePaise > 0 ? "Settle up to keep a clean slate" : "Nothing pending"}
          icon={ArrowUpRight}
          tone={data!.youOwePaise > 0 ? "warn" : "default"}
        />
        <StatCard
          index={1}
          label="Owed to you"
          value={formatINR(data!.owedToYouPaise)}
          hint={data!.owedToYouPaise > 0 ? "From past games" : "All settled"}
          icon={ArrowDownLeft}
          tone={data!.owedToYouPaise > 0 ? "good" : "default"}
        />
        <StatCard
          index={2}
          label="Spent this month"
          value={formatINR(data!.monthSpendPaise)}
          hint={`Received ${formatINR(data!.monthReceivedPaise)} back`}
          icon={Wallet}
        />
        <StatCard
          index={3}
          label="Games this month"
          value={String(data!.gamesThisMonth)}
          hint={`${data!.totalGames} games all time`}
          icon={CalendarDays}
        />
      </div>

      {/* Today's games — always shown, empty by default */}
      <section>
        <SectionTitle title="Playing today" />
        {data!.todaysGames.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No games today"
            description="Nothing scheduled for today."
            className="py-8"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {data!.todaysGames.map((g, i) => (
              <GameCard key={g.id} game={g} index={i} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Upcoming */}
        <section className="lg:col-span-3">
          <SectionTitle
            title="Upcoming games"
            action={
              <Link to="/games" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            }
          />
          {data!.upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming games"
              description="Book your next session and the split is handled automatically."
              action={
                canEdit ? (
                  <Button size="sm" onClick={() => setBookingOpen(true)}>
                    <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> New booking
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {data!.upcoming.map((g, i) => (
                <GameCard key={g.id} game={g} index={i} />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-8 lg:col-span-2">
          {/* Monthly spend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Monthly spending
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data!.monthlySpend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="paise"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#spend)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex justify-between">
                {data!.monthlySpend.map((m) => (
                  <div key={m.month} className="text-center">
                    <p className="text-[10px] text-muted-foreground">{m.month}</p>
                    <p className="text-[11px] font-medium tabular">{formatINRCompact(m.paise)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateBookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
