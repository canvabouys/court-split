import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, Clock, Users } from "lucide-react";
import { SPORTS } from "@contracts/sports";
import { rupeesToPaise, formatINR } from "@contracts/money";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { durationLabel } from "@/lib/format";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const MAX_PLAYERS = 8;
const BADMINTON_VENUES = SPORTS.Badminton.venues;

export function CreateBookingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: players } = trpc.players.list.useQuery(undefined, { enabled: open });

  const [venue, setVenue] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [attendees, setAttendees] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (players) setAttendees(new Set(players.map((p) => p.userId)));
  }, [players]);

  const durationMin = useMemo(() => {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  }, [startTime, endTime]);
  const timeValid = durationMin >= 30;

  const create = trpc.bookings.create.useMutation({
    onSuccess: async (res) => {
      toast.success("Booking created", {
        description: "Cost is split only among the players marked present.",
      });
      await Promise.all([
        utils.bookings.list.invalidate(),
        utils.bookings.upcoming.invalidate(),
        utils.dashboard.summary.invalidate(),
        utils.activity.list.invalidate(),
      ]);
      onOpenChange(false);
      setVenue("");
      setCost("");
      setNotes("");
      navigate(`/bookings/${res.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const costPaise = rupeesToPaise(parseFloat(cost) || 0);
  const perPerson = attendees.size > 0 ? Math.round(costPaise / attendees.size) : 0;
  const canSubmit =
    venue.trim().length >= 2 && costPaise > 0 && attendees.size > 0 && timeValid;

  const toggleAttendee = (id: number) =>
    setAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_PLAYERS) {
          toast.error(`Badminton games cap at ${MAX_PLAYERS} players`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">🏸</span> New badminton booking
          </DialogTitle>
          <DialogDescription>
            The total cost is split among attendees only — adjust attendance any time before or
            after the game.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Venue</Label>
            <Input
              placeholder={`e.g. ${BADMINTON_VENUES[0]}`}
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              list="venue-suggestions"
            />
            <datalist id="venue-suggestions">
              {BADMINTON_VENUES.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>

          <div>
            <Label className="mb-1.5 block">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* From → To time */}
          <div>
            <Label className="mb-1.5 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Time — from → to
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "1h", min: 60 },
                  { label: "1h 30m", min: 90 },
                  { label: "2h", min: 120 },
                  { label: "3h", min: 180 },
                ].map((d) => {
                  const [sh, sm] = startTime.split(":").map(Number);
                  const end = sh * 60 + sm + d.min;
                  const value = `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(
                    end % 60,
                  ).padStart(2, "0")}`;
                  return (
                    <button
                      key={d.min}
                      type="button"
                      onClick={() => setEndTime(value)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        durationMin === d.min
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-foreground/20",
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  timeValid ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400",
                )}
              >
                {timeValid ? durationLabel(durationMin) : "End must be after start (min 30m)"}
              </span>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">Total cost (₹)</Label>
            <Input
              type="number"
              min={0}
              placeholder="800"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
            {costPaise > 0 && attendees.size > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                ≈ <span className="font-semibold text-foreground">{formatINR(perPerson)}</span> per
                person · split among {attendees.size}{" "}
                {attendees.size === 1 ? "player" : "players"}
              </p>
            )}
          </div>

          <div>
            <Label className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Who's playing?
              </span>
              <span
                className={cn(
                  "text-[11px] font-normal",
                  attendees.size >= MAX_PLAYERS ? "text-primary" : "text-muted-foreground",
                )}
              >
                {attendees.size}/{MAX_PLAYERS}
              </span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {players?.map((p) => {
                const on = attendees.has(p.userId);
                return (
                  <button
                    key={p.userId}
                    type="button"
                    onClick={() => toggleAttendee(p.userId)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition-all",
                      on
                        ? "border-primary bg-primary/10"
                        : "border-border text-muted-foreground opacity-70 hover:opacity-100",
                    )}
                  >
                    <UserAvatar name={p.name} seed={p.userId} className="h-5 w-5 text-[8px]" />
                    {p.name.split(" ")[0]}
                    {on && <Check className="h-3 w-3 text-primary" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Only players selected here share the cost. Max {MAX_PLAYERS} per game.
            </p>
          </div>

          <div>
            <Label className="mb-1.5 block">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              rows={2}
              placeholder="Court 3, bring shuttles…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || create.isPending}
            onClick={() => {
              create.mutate({
                venue: venue.trim(),
                startsAt: new Date(`${date}T${startTime}`),
                durationMin,
                costPaise,
                notes: notes.trim() || undefined,
                attendeeIds: [...attendees],
              });
            }}
          >
            {create.isPending ? "Creating…" : "Create booking"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            You're recorded as paying the full amount up-front — edit later if others chipped in.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
