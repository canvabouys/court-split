import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  HandCoins,
  MapPin,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { sportEmoji } from "@contracts/sports";
import { MAX_PLAYERS_PER_GAME } from "@contracts/constants";
import { computePairwiseDebts } from "@contracts/settlement";
import { formatINR, paiseToRupees, rupeesToPaise } from "@contracts/money";
import { trpc } from "@/providers/trpc";
import { useAccess } from "@/hooks/useAccess";
import { cn } from "@/lib/utils";
import { durationLabel, fullDateLabel, gameTimeLabel } from "@/lib/format";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BookingData {
  id: number;
  sport: string;
  venue: string;
  startsAt: Date;
  durationMin: number;
  costPaise: number;
  shuttleCostPaise: number;
  notes: string | null;
  splitType: string;
  splitConfig: { customPaise?: Record<number, number>; weights?: Record<number, number> };
  status: string;
  bookedBy: { id: number; name: string | null; avatar: string | null };
  members: { userId: number; name: string | null; avatar: string | null }[];
  attendance: {
    userId: number;
    name: string | null;
    rosterName: string | null;
    avatar: string | null;
    attended: boolean;
    nameOverride: string | null;
  }[];
  contributions: { userId: number; name: string | null; avatar: string | null; amountPaise: number }[];
  splits: {
    userId: number;
    name: string | null;
    avatar: string | null;
    amountPaise: number;
    settled: boolean;
  }[];
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const bookingId = Number(id);
  const navigate = useNavigate();
  const { isAdmin } = useAccess();
  const { data: booking, isLoading } = trpc.bookings.get.useQuery({ id: bookingId });
  const utils = trpc.useUtils();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const invalidate = async () => {
    await Promise.all([
      utils.bookings.get.invalidate({ id: bookingId }),
      utils.bookings.list.invalidate(),
      utils.bookings.upcoming.invalidate(),
      utils.dashboard.summary.invalidate(),
    ]);
  };

  const del = trpc.bookings.delete.useMutation({
    onSuccess: async () => {
      toast.success("Booking deleted");
      await utils.bookings.list.invalidate();
      navigate("/games");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !booking) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const starts = new Date(booking.startsAt);
  const attendees = booking.attendance.filter((a) => a.attended);
  const totalPaise = booking.costPaise + (booking.shuttleCostPaise ?? 0);

  // Per-game settlement: who should pay whom for THIS game only.
  const gamePlan = computePairwiseDebts(
    [
      {
        bookingId: booking.id,
        contributions: booking.contributions.map((c) => ({
          userId: c.userId,
          amountPaise: c.amountPaise,
        })),
        shares: booking.splits.map((s) => ({ userId: s.userId, amountPaise: s.amountPaise })),
      },
    ],
    [],
  );
  // Override-aware names for the settlement arrows.
  const nameOf = new Map(booking.members.map((m) => [m.userId, m.name ?? "Player"]));
  for (const a of booking.attendance) {
    if (a.nameOverride) nameOf.set(a.userId, a.nameOverride);
  }

  return (
    <div className="space-y-6">
      <Link
        to="/games"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All games
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-2xl">
            {sportEmoji(booking.sport)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{booking.venue}</h1>
              <Badge
                variant={booking.status === "played" ? "secondary" : "default"}
                className={cn(
                  "text-[10px] capitalize",
                  booking.status === "scheduled" && "bg-primary/10 text-primary hover:bg-primary/10",
                  booking.status === "cancelled" && "bg-destructive/10 text-destructive hover:bg-destructive/10",
                )}
              >
                {booking.status}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {fullDateLabel(starts)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {gameTimeLabel(starts)} · {durationLabel(booking.durationMin)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {booking.sport}
              </span>
            </div>
            {booking.notes && (
              <p className="mt-2 flex items-start gap-1.5 text-[13px] text-muted-foreground">
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {booking.notes}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total cost</p>
            <p className="text-xl font-bold tabular">{formatINR(totalPaise)}</p>
            {(booking.shuttleCostPaise ?? 0) > 0 && (
              <p className="text-[11px] text-muted-foreground tabular">
                Court {formatINR(booking.costPaise)} · Shuttles {formatINR(booking.shuttleCostPaise)}
              </p>
            )}
          </div>
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Attendance */}
        <AttendanceCard booking={booking} onChanged={invalidate} />

        {/* Player payments (settled or not) */}
        <PlayerPaymentsCard booking={booking} onChanged={invalidate} />

        {/* Shuttle expense */}
        <ShuttlesCard booking={booking} onChanged={invalidate} />

        {/* This game's settlement */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <HandCoins className="h-4 w-4 text-primary" /> This game's settlement
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {(booking.shuttleCostPaise ?? 0) > 0
                ? `${formatINR(booking.costPaise)} court + ${formatINR(booking.shuttleCostPaise)} shuttles`
                : formatINR(booking.costPaise)}{" "}
              split {booking.splitType} among {attendees.length}{" "}
              {attendees.length === 1 ? "player" : "players"} — only players marked present.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {gamePlan.length === 0 ? (
              <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                {attendees.length === 0
                  ? "Mark attendance to compute the split."
                  : "The payer is the only attendee — nothing to settle."}
              </p>
            ) : (
              gamePlan.map((t, i) => (
                <motion.div
                  key={`${t.fromUserId}-${t.toUserId}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm"
                >
                  <span className="font-medium">{nameOf.get(t.fromUserId)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{nameOf.get(t.toUserId)}</span>
                  <span className="ml-auto font-bold tabular">{formatINR(t.amountPaise)}</span>
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Contributions */}
        <ContributionsCard booking={booking} onChanged={invalidate} />
      </div>

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              The booking, its attendance and expense records will be removed. Balances recompute
              automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => del.mutate({ id: booking.id })}
            >
              Delete booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editOpen && (
        <EditBookingDialog booking={booking} onClose={() => setEditOpen(false)} onChanged={invalidate} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Attendance — only players added to this game, admin can rename      */
/* ------------------------------------------------------------------ */

function AttendanceCard({
  booking,
  onChanged,
}: {
  booking: BookingData;
  onChanged: () => Promise<void>;
}) {
  const { isAdmin } = useAccess();
  const [state, setState] = useState<Map<number, boolean>>(new Map());
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    setState(new Map(booking.attendance.map((a) => [a.userId, a.attended])));
  }, [booking.attendance]);

  const save = trpc.bookings.setAttendance.useMutation({
    onSuccess: async () => {
      toast.success("Attendance saved — split recomputed");
      await onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const rename = trpc.bookings.renameAttendee.useMutation({
    onSuccess: async () => {
      toast.success("Name updated for this game");
      setRenaming(null);
      await onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const addAttendee = trpc.bookings.addAttendee.useMutation({
    onSuccess: async () => {
      toast.success("Player added to the game");
      await onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const attendedCount = [...state.values()].filter(Boolean).length;
  const dirty =
    booking.attendance.some((a) => state.get(a.userId) !== a.attended) ||
    state.size !== booking.attendance.length;
  const totalPaise = booking.costPaise + (booking.shuttleCostPaise ?? 0);

  // Roster players not yet in this game — available to add.
  const inGame = new Set(booking.attendance.map((a) => a.userId));
  const addable = booking.members.filter((m) => !inGame.has(m.userId));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" /> Attendance
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Only players marked present share the cost. {attendedCount} playing
          {attendedCount > 0 && ` · ${formatINR(Math.round(totalPaise / attendedCount))} each`}.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {booking.attendance.map((a) => {
            const attended = state.get(a.userId) ?? a.attended;
            const isRenaming = renaming === a.userId;
            return (
              <div
                key={a.userId}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors",
                  attended ? "hover:bg-accent/40" : "opacity-60",
                )}
              >
                <UserAvatar name={a.name} seed={a.userId} className="h-7 w-7" />
                {isRenaming ? (
                  <form
                    className="flex flex-1 items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = renameValue.trim();
                      if (!name) return;
                      rename.mutate({ id: booking.id, userId: a.userId, name });
                    }}
                  >
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      maxLength={80}
                      className="h-8 flex-1 text-[13px]"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-primary"
                      disabled={rename.isPending || !renameValue.trim()}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setRenaming(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-[13px] font-medium">
                      {a.name}
                      {a.nameOverride && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          (was {a.rosterName})
                        </span>
                      )}
                    </span>
                    {isAdmin && (
                      <button
                        className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-foreground"
                        title="Rename for this game"
                        onClick={() => {
                          setRenaming(a.userId);
                          setRenameValue(a.name ?? "");
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
                <Switch
                  checked={attended}
                  disabled={!isAdmin}
                  onCheckedChange={(v) => {
                    if (v && attendedCount >= MAX_PLAYERS_PER_GAME) {
                      toast.error(`Badminton games cap at ${MAX_PLAYERS_PER_GAME} players`);
                      return;
                    }
                    setState((prev) => new Map(prev).set(a.userId, v));
                  }}
                />
              </div>
            );
          })}
        </div>

        {isAdmin && (
          <div className="mt-3 space-y-2">
            {addable.length > 0 && attendedCount < MAX_PLAYERS_PER_GAME && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add player to this game
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-56">
                  {addable.map((m) => (
                    <DropdownMenuItem
                      key={m.userId}
                      disabled={addAttendee.isPending}
                      onClick={() => addAttendee.mutate({ id: booking.id, userId: m.userId })}
                    >
                      {m.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              className="w-full"
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() =>
                save.mutate({
                  id: booking.id,
                  attendance: [...state.entries()].map(([userId, attended]) => ({
                    userId,
                    attended,
                  })),
                })
              }
            >
              {save.isPending ? "Saving…" : "Save attendance"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Player payments — per attendee: paid or not                         */
/* ------------------------------------------------------------------ */

function PlayerPaymentsCard({
  booking,
  onChanged,
}: {
  booking: BookingData;
  onChanged: () => Promise<void>;
}) {
  const { isAdmin } = useAccess();

  const setSettled = trpc.bookings.setSplitSettled.useMutation({
    onSuccess: async () => {
      await onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const paidUpFront = new Map(booking.contributions.map((c) => [c.userId, c.amountPaise]));
  const rows = booking.splits.map((s) => {
    const upfront = paidUpFront.get(s.userId) ?? 0;
    // A payer's own share is covered by the money they put in up-front.
    const settled = s.settled || upfront >= s.amountPaise;
    return { ...s, upfront, settled };
  });
  const settledCount = rows.filter((r) => r.settled).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <UserCheck className="h-4 w-4 text-primary" /> Player payments
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {settledCount} of {rows.length} settled
          {rows.length > 0 && settledCount === rows.length ? " — game fully settled 🎉" : ""}.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
            No one is marked present yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div
                key={r.userId}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <UserAvatar name={r.name} seed={r.userId} className="h-7 w-7" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    share {formatINR(r.amountPaise)}
                    {r.upfront > 0 && ` · paid ${formatINR(r.upfront)} up-front`}
                  </p>
                </div>
                {r.upfront >= r.amountPaise ? (
                  <Badge className="gap-1 border-primary/30 bg-primary/10 text-primary hover:bg-primary/10">
                    <Check className="h-3 w-3" /> Paid up-front
                  </Badge>
                ) : isAdmin ? (
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        r.settled ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {r.settled ? "Paid" : "Not paid"}
                    </span>
                    <Switch
                      checked={r.settled}
                      disabled={setSettled.isPending}
                      onCheckedChange={(v) =>
                        setSettled.mutate({ id: booking.id, userId: r.userId, settled: v })
                      }
                    />
                  </div>
                ) : (
                  <Badge
                    variant={r.settled ? "default" : "secondary"}
                    className={cn(r.settled && "gap-1 bg-primary/90 hover:bg-primary/90")}
                  >
                    {r.settled && <Check className="h-3 w-3" />}
                    {r.settled ? "Paid" : "Not paid"}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Shuttles — optional shuttlecock expense, split among everyone       */
/* ------------------------------------------------------------------ */

function ShuttlesCard({
  booking,
  onChanged,
}: {
  booking: BookingData;
  onChanged: () => Promise<void>;
}) {
  const { isAdmin, isRoute } = useAccess();
  const canEdit = isAdmin || isRoute;
  const hasShuttles = (booking.shuttleCostPaise ?? 0) > 0;
  const [enabled, setEnabled] = useState(hasShuttles);
  const [amount, setAmount] = useState(
    hasShuttles ? String(paiseToRupees(booking.shuttleCostPaise)) : "",
  );

  useEffect(() => {
    setEnabled(hasShuttles);
    setAmount(hasShuttles ? String(paiseToRupees(booking.shuttleCostPaise)) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.shuttleCostPaise]);

  const save = trpc.bookings.setShuttles.useMutation({
    onSuccess: async () => {
      toast.success("Shuttle cost updated — split recomputed");
      await onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const parsedPaise = rupeesToPaise(parseFloat(amount) || 0);
  const target = enabled ? parsedPaise : 0;
  const dirty = target !== (booking.shuttleCostPaise ?? 0) || (!enabled && hasShuttles);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4 text-primary" /> Bought shuttles?
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {hasShuttles
            ? `${formatINR(booking.shuttleCostPaise)} added to this game — split among everyone present.`
            : "Add the shuttle expense and it's split among everyone present."}
        </p>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">
                {enabled ? "Yes, shuttles were bought" : "No shuttle expense"}
              </span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            {enabled && (
              <div>
                <Label className="mb-1 block text-xs">Total shuttle fare (₹)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    placeholder="e.g. 240"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                    ₹
                  </span>
                </div>
              </div>
            )}
            <Button
              size="sm"
              className="w-full"
              disabled={!dirty || save.isPending || (enabled && parsedPaise <= 0)}
              onClick={() => save.mutate({ id: booking.id, shuttleCostPaise: target })}
            >
              {save.isPending ? "Saving…" : "Save shuttle cost"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {hasShuttles
              ? `Shuttlecocks ${formatINR(booking.shuttleCostPaise)} — included in everyone's share.`
              : "No shuttle expense for this game."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Contributions                                                       */
/* ------------------------------------------------------------------ */

function ContributionsCard({
  booking,
  onChanged,
}: {
  booking: BookingData;
  onChanged: () => Promise<void>;
}) {
  const { isAdmin } = useAccess();
  const [inputs, setInputs] = useState<Map<number, number>>(new Map());
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const initial = new Map<number, number>();
    for (const m of booking.members) {
      const c = booking.contributions.find((cc) => cc.userId === m.userId);
      initial.set(m.userId, c ? paiseToRupees(c.amountPaise) : 0);
    }
    setInputs(initial);
  }, [booking.contributions, booking.members]);

  const total = rupeesToPaise([...inputs.values()].reduce((a, b) => a + b, 0));
  const expected = booking.costPaise + (booking.shuttleCostPaise ?? 0);
  const matches = total === expected;

  const save = trpc.bookings.setContributions.useMutation({
    onSuccess: async () => {
      toast.success("Contributions updated");
      setEditing(false);
      await onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Check className="h-4 w-4 text-primary" /> Who paid up-front
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Booked by {booking.bookedBy.name}. Multiple payers are supported.
          </p>
        </div>
        {isAdmin && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Change
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-1.5">
            {booking.attendance.map((m) => (
              <div key={m.userId} className="flex items-center gap-2.5">
                <UserAvatar name={m.name} seed={m.userId} className="h-6 w-6 text-[9px]" />
                <span className="flex-1 truncate text-[13px]">{m.name}</span>
                <div className="relative w-28">
                  <Input
                    type="number"
                    min={0}
                    className="h-8 pr-6 text-right text-[13px]"
                    value={inputs.get(m.userId) ?? 0}
                    onChange={(e) =>
                      setInputs((prev) =>
                        new Map(prev).set(m.userId, parseFloat(e.target.value) || 0),
                      )
                    }
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">₹</span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 text-[13px]">
              <span className="text-muted-foreground">Total</span>
              <span
                className={cn(
                  "tabular font-semibold",
                  matches ? "text-primary" : "text-amber-600 dark:text-amber-400",
                )}
              >
                {formatINR(total)} / {formatINR(expected)}
              </span>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!matches || save.isPending}
                onClick={() =>
                  save.mutate({
                    id: booking.id,
                    contributions: booking.members.map((m) => ({
                      userId: m.userId,
                      amountPaise: rupeesToPaise(inputs.get(m.userId) ?? 0),
                    })),
                  })
                }
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {booking.contributions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              booking.contributions.map((c) => (
                <div key={c.userId} className="flex items-center gap-2.5 text-[13px]">
                  <UserAvatar name={c.name} seed={c.userId} className="h-6 w-6 text-[9px]" />
                  <span className="flex-1">{c.name}</span>
                  <span className="tabular font-semibold">{formatINR(c.amountPaise)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Edit dialog                                                         */
/* ------------------------------------------------------------------ */

function EditBookingDialog({
  booking,
  onClose,
  onChanged,
}: {
  booking: BookingData;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const starts = new Date(booking.startsAt);
  const [venue, setVenue] = useState(booking.venue);
  const [cost, setCost] = useState(String(paiseToRupees(booking.costPaise)));
  const [notes, setNotes] = useState(booking.notes ?? "");

  const update = trpc.bookings.update.useMutation({
    onSuccess: async () => {
      toast.success("Booking updated");
      await onChanged();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AlertDialog open onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Edit booking</AlertDialogTitle>
          <AlertDialogDescription>
            {fullDateLabel(starts)} · {gameTimeLabel(starts)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Venue</Label>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Total cost (₹)</Label>
            <Input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={update.isPending}
            onClick={() =>
              update.mutate({
                id: booking.id,
                venue: venue.trim(),
                costPaise: rupeesToPaise(parseFloat(cost) || 0),
                notes: notes.trim() || null,
              })
            }
          >
            Save changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
