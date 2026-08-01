import { and, eq, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  activityLogs,
  attendance,
  bookings,
  contributions,
  groupMembers,
  payments,
  splits,
  users,
} from "@db/schema";
import { computeShares, type SplitType } from "@contracts/settlement";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { getWorkspace } from "../lib/workspace";
import { requireAdmin } from "../lib/access";

const DEMO_PLAYERS = [
  { slug: "abhishek", name: "Abhishek", upi: "abhishek@okhdfcbank" },
  { slug: "sanjay", name: "Sanjay", upi: "sanjay@ybl" },
  { slug: "rahul", name: "Rahul", upi: "rahul@okicici" },
  { slug: "hari", name: "Hari Prasad", upi: "hari.prasad@paytm" },
  { slug: "bhuvan", name: "Bhuvan", upi: "bhuvan@oksbi" },
  { slug: "kushal", name: "Kushal", upi: "kushal@okaxis" },
  { slug: "yashwanth", name: "Yashwanth", upi: "yashwanth@upi" },
];

const VENUES = [
  "PlayArena Sports Hub",
  "SmashZone Indoor Arena",
  "Feather Flight Academy",
  "Court Kings",
];

function at(daysFromNow: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

interface GameSpec {
  daysFromNow: number;
  hour: number;
  minute?: number;
  venue: string;
  durationMin: number;
  costPaise: number;
  booker: string;
  attendees: string[];
  payers?: { who: string; paise: number }[];
  shuttlePaise?: number;
  splitType?: SplitType;
  weights?: Record<string, number>;
  notes?: string;
}

const ALL = ["me", ...DEMO_PLAYERS.map((p) => p.slug)];

export const demoRouter = createRouter({
  seed: authedQuery.mutation(async ({ ctx }) => {
    requireAdmin(ctx);
    if (ctx.wsMode === "nars") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Demo data isn't available in Route mode.",
      });
    }
    const db = getDb();
    const { group, user: me } = await getWorkspace(ctx.wsMode);

    const existing = await db.query.bookings.findFirst({
      where: and(eq(bookings.groupId, group.id), ne(bookings.status, "cancelled")),
    });
    if (existing) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Demo data can only be loaded before you create your own games.",
      });
    }

    /* ---------------- players (reuse the default roster by name) ---------------- */
    const roster = await db.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, group.id),
      with: { user: true },
    });
    const byName = new Map(roster.map((m) => [m.user.name, m.user]));
    const playerIds = new Map<string, number>([["me", me.id]]);
    for (const p of DEMO_PLAYERS) {
      const existing = byName.get(p.name);
      if (existing) {
        playerIds.set(p.slug, existing.id);
      } else {
        const [{ id }] = await db
          .insert(users)
          .values({ unionId: `demo_${p.slug}`, name: p.name, upiId: p.upi, role: "user" })
          .$returningId();
        await db.insert(groupMembers).values({ groupId: group.id, userId: id, role: "member" });
        playerIds.set(p.slug, id);
      }
    }
    const pid = (slug: string) => playerIds.get(slug)!;

    /* ---------------- games (badminton only, ≤ 8 players) ---------------- */
    const games: GameSpec[] = [
      {
        daysFromNow: -63, hour: 7, venue: VENUES[0],
        durationMin: 120, costPaise: 80000, booker: "me", attendees: ALL,
        shuttlePaise: 24000,
        notes: "Season opener — bring your own rackets, shuttles on me.",
      },
      {
        daysFromNow: -56, hour: 7, venue: VENUES[0],
        durationMin: 120, costPaise: 80000, booker: "abhishek",
        attendees: ["me", "abhishek", "rahul", "sanjay", "kushal", "bhuvan"],
      },
      {
        daysFromNow: -49, hour: 8, minute: 30, venue: VENUES[1],
        durationMin: 90, costPaise: 67500, booker: "sanjay",
        attendees: ["me", "abhishek", "sanjay", "kushal", "hari", "yashwanth"],
      },
      {
        daysFromNow: -42, hour: 7, venue: VENUES[0],
        durationMin: 120, costPaise: 90000, booker: "me", attendees: ALL,
        splitType: "percentage",
        weights: { me: 20, abhishek: 15, rahul: 10, sanjay: 15, kushal: 10, hari: 10, bhuvan: 10, yashwanth: 10 },
        notes: "Booked the premium court — I covered the extra since I chose it.",
      },
      {
        daysFromNow: -35, hour: 7, venue: VENUES[2],
        durationMin: 120, costPaise: 72000, booker: "kushal",
        attendees: ["me", "kushal", "rahul", "bhuvan", "yashwanth", "abhishek"],
      },
      {
        daysFromNow: -28, hour: 8, venue: VENUES[0],
        durationMin: 120, costPaise: 80000, booker: "me", attendees: ALL,
      },
      {
        daysFromNow: -21, hour: 7, venue: VENUES[1],
        durationMin: 120, costPaise: 90000, booker: "bhuvan",
        attendees: ["me", "bhuvan", "sanjay", "hari", "rahul"],
        shuttlePaise: 18000,
        payers: [
          { who: "bhuvan", paise: 60000 },
          { who: "me", paise: 30000 },
        ],
        notes: "Bhuvan's card got declined at the counter, I pitched in ₹300.",
      },
      {
        daysFromNow: -14, hour: 7, venue: VENUES[0],
        durationMin: 120, costPaise: 80000, booker: "me", attendees: ALL,
      },
      {
        daysFromNow: -7, hour: 7, venue: VENUES[0],
        durationMin: 120, costPaise: 84000, booker: "yashwanth",
        attendees: ["me", "yashwanth", "abhishek", "kushal", "sanjay", "hari"],
        splitType: "weighted",
        weights: { me: 2, yashwanth: 2, abhishek: 2, kushal: 1, sanjay: 1, hari: 1 },
        notes: "Kushal, Sanjay and Hari left after the first hour — weighted split.",
      },
      {
        daysFromNow: 0, hour: 19, venue: VENUES[0],
        durationMin: 90, costPaise: 67500, booker: "me", attendees: ALL,
        notes: "Weeknight doubles session — confirm attendance by 5 PM.",
      },
      {
        daysFromNow: 3, hour: 7, venue: VENUES[0],
        durationMin: 120, costPaise: 80000, booker: "abhishek", attendees: ALL,
      },
      {
        daysFromNow: 10, hour: 7, venue: VENUES[3],
        durationMin: 120, costPaise: 96000, booker: "me", attendees: ALL,
        notes: "Trying the new courts at Court Kings. Slightly pricier but wooden flooring.",
      },
    ];

    const gameIds: number[] = [];
    for (const g of games) {
      const played = g.daysFromNow < 0 || (g.daysFromNow === 0 && g.hour <= new Date().getHours());
      const shuttle = g.shuttlePaise ?? 0;
      const totalPaise = g.costPaise + shuttle;
      const [{ id }] = await db
        .insert(bookings)
        .values({
          groupId: group.id,
          sport: "Badminton",
          venue: g.venue,
          startsAt: at(g.daysFromNow, g.hour, g.minute ?? 0),
          durationMin: g.durationMin,
          costPaise: g.costPaise,
          shuttleCostPaise: shuttle,
          bookedById: pid(g.booker),
          notes: g.notes ?? null,
          splitType: g.splitType ?? "equal",
          splitConfig: g.weights
            ? JSON.stringify({
                weights: Object.fromEntries(
                  Object.entries(g.weights).map(([slug, w]) => [pid(slug), w]),
                ),
              })
            : null,
          status: played ? "played" : "scheduled",
          createdAt: at(g.daysFromNow - 3, 12),
        })
        .$returningId();
      gameIds.push(id);

      const attendeeIds = g.attendees.map(pid);
      const absentees = ALL.filter((s) => !g.attendees.includes(s)).map(pid);
      await db.insert(attendance).values([
        ...attendeeIds.map((userId) => ({ bookingId: id, userId, attended: true })),
        ...absentees.map((userId) => ({ bookingId: id, userId, attended: false })),
      ]);

      // The booker also paid for the shuttles up-front.
      const payerRows = (
        g.payers ?? [{ who: g.booker, paise: g.costPaise }]
      ).map((p) => ({
        bookingId: id,
        userId: pid(p.who),
        amountPaise: p.paise + (p.who === g.booker ? shuttle : 0),
      }));
      await db.insert(contributions).values(payerRows);

      const weights = g.weights
        ? Object.fromEntries(Object.entries(g.weights).map(([slug, w]) => [pid(slug), w]))
        : undefined;
      const shares = computeShares(totalPaise, attendeeIds, g.splitType ?? "equal", { weights });
      await db
        .insert(splits)
        .values(shares.map((s) => ({ bookingId: id, userId: s.userId, amountPaise: s.amountPaise })));
    }

    /* ---------------- payments ---------------- */
    const paymentRows = [
      { from: "abhishek", to: "me", paise: 20000, days: -55, status: "completed" as const, method: "upi" as const, note: "For the last two Sundays" },
      { from: "rahul", to: "me", paise: 10000, days: -41, status: "completed" as const, method: "upi" as const, note: "Court split" },
      { from: "kushal", to: "me", paise: 10000, days: -41, status: "completed" as const, method: "cash" as const, note: null },
      { from: "me", to: "yashwanth", paise: 14000, days: -6, status: "completed" as const, method: "upi" as const, note: "Last Sunday's share" },
      { from: "sanjay", to: "me", paise: 15000, days: -1, status: "pending" as const, method: "upi" as const, note: "Settling my dues" },
    ];
    for (const p of paymentRows) {
      await db.insert(payments).values({
        groupId: group.id,
        fromUserId: pid(p.from),
        toUserId: pid(p.to),
        amountPaise: p.paise,
        status: p.status,
        method: p.method,
        note: p.note,
        createdAt: at(p.days, 22),
        completedAt: p.status === "completed" ? at(p.days, 22, 30) : null,
      });
    }

    /* ---------------- activity ---------------- */
    const activityRows: { who: string; action: string; detail: string; days: number }[] = [
      { who: "me", action: "player.added", detail: "added Abhishek to the crew", days: -69 },
      { who: "me", action: "booking.created", detail: "booked Badminton at PlayArena Sports Hub", days: -66 },
      { who: "sanjay", action: "booking.created", detail: "booked Badminton at SmashZone Indoor Arena", days: -52 },
      { who: "abhishek", action: "payment.initiated", detail: "settled ₹200", days: -55 },
      { who: "me", action: "booking.created", detail: "booked Badminton at PlayArena Sports Hub", days: -31 },
      { who: "yashwanth", action: "booking.created", detail: "booked Badminton at PlayArena Sports Hub", days: -10 },
      { who: "sanjay", action: "payment.initiated", detail: "initiated a ₹150 settlement", days: -1 },
    ];
    await db.insert(activityLogs).values(
      activityRows.map((a) => ({
        groupId: group.id,
        userId: pid(a.who),
        action: a.action,
        detail: a.detail,
        createdAt: at(a.days, 20),
      })),
    );

    return { ok: true, games: gameIds.length };
  }),
});
