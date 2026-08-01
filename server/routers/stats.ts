import { z } from "zod";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  attendance,
  bookings,
  contributions,
  groupMembers,
  payments,
  splits,
  users,
} from "@db/schema";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { getWorkspace } from "../lib/workspace";
import { requireAdmin } from "../lib/access";
import { computeGroupLedger } from "../lib/balances";

function monthStart(offset = 0): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

export const usersRouter = createRouter({
  updateProfile: authedQuery
    .input(
      z.object({
        name: z.string().trim().min(1).max(80).optional(),
        upiId: z
          .string()
          .trim()
          .max(120)
          .regex(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/, "Enter a valid UPI ID like name@bank")
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      await db
        .update(users)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.upiId !== undefined ? { upiId: input.upiId } : {}),
        })
        .where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),
});

export const statsRouter = createRouter({
  personal: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const { group } = await getWorkspace(ctx.wsMode);
    const gid = group.id;

    const myAttendance = await db.query.attendance.findMany({
      where: eq(attendance.userId, ctx.user.id),
      with: { booking: true },
    });
    const relevant = myAttendance.filter((a) => a.booking.groupId === gid);
    if (relevant.length === 0) return { hasData: false as const };

    const gamesPlayed = relevant.filter(
      (a) => a.attended && (a.booking.status === "played" || a.booking.startsAt < new Date()),
    ).length;
    const attendancePct =
      relevant.length === 0
        ? 100
        : Math.round((relevant.filter((a) => a.attended).length / relevant.length) * 100);

    const myContributions = await db.query.contributions.findMany({
      where: eq(contributions.userId, ctx.user.id),
      with: { booking: true },
    });
    const moneyPaidPaise = myContributions
      .filter((c) => c.booking.groupId === gid)
      .reduce((a, c) => a + c.amountPaise, 0);

    const received = await db.query.payments.findMany({
      where: and(
        eq(payments.groupId, gid),
        eq(payments.toUserId, ctx.user.id),
        eq(payments.status, "completed"),
      ),
    });
    const moneyReceivedPaise = received.reduce((a, p) => a + p.amountPaise, 0);

    const ledger = await computeGroupLedger(gid);
    const bal = ledger.balances.get(ctx.user.id) ?? 0;
    const owePaise = bal < 0 ? -bal : 0;
    const owedPaise = bal > 0 ? bal : 0;

    const attendedBookings = relevant
      .filter((a) => a.attended)
      .map((a) => a.booking)
      .filter((b) => b.status !== "cancelled");
    const avgCostPaise =
      attendedBookings.length === 0
        ? 0
        : Math.round(
            attendedBookings.reduce((a, b) => a + b.costPaise, 0) / attendedBookings.length,
          );

    // venue breakdown
    const venueCount = new Map<string, number>();
    for (const b of attendedBookings) venueCount.set(b.venue, (venueCount.get(b.venue) ?? 0) + 1);
    const venueBreakdown = [...venueCount.entries()]
      .map(([venue, count]) => ({ venue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // monthly series
    const mySplits = await db.query.splits.findMany({
      where: eq(splits.userId, ctx.user.id),
      with: { booking: true },
    });
    const splitsHere = mySplits.filter((s) => s.booking.groupId === gid);
    const monthly: { month: string; spendPaise: number; paidPaise: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = monthStart(-i);
      const end = monthStart(-i + 1);
      monthly.push({
        month: start.toLocaleString("en-US", { month: "short" }),
        spendPaise: splitsHere
          .filter((s) => s.booking.startsAt >= start && s.booking.startsAt < end)
          .reduce((a, s) => a + s.amountPaise, 0),
        paidPaise: myContributions
          .filter(
            (c) =>
              c.booking.groupId === gid &&
              c.booking.startsAt >= start &&
              c.booking.startsAt < end,
          )
          .reduce((a, c) => a + c.amountPaise, 0),
      });
    }

    // most active players across the crew
    const allAttendance = await db.query.attendance.findMany({
      where: eq(attendance.attended, true),
      with: { booking: true, user: true },
    });
    const here = allAttendance.filter((r) => r.booking.groupId === gid);
    const counts = new Map<number, { count: number; name: string; avatar: string | null }>();
    for (const r of here) {
      const cur = counts.get(r.userId) ?? {
        count: 0,
        name: r.user.name ?? "Player",
        avatar: r.user.avatar,
      };
      cur.count += 1;
      counts.set(r.userId, cur);
    }
    const mostActive = [...counts.entries()]
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const achievements = [
      {
        key: "first-game",
        title: "First Game",
        description: "Played your first game",
        earned: gamesPlayed >= 1,
      },
      {
        key: "regular",
        title: "Regular",
        description: "Played 10 games",
        earned: gamesPlayed >= 10,
      },
      {
        key: "veteran",
        title: "Veteran",
        description: "Played 25 games",
        earned: gamesPlayed >= 25,
      },
      {
        key: "banker",
        title: "The Banker",
        description: "Paid up-front for 5 bookings",
        earned: myContributions.filter((c) => c.booking.groupId === gid).length >= 5,
      },
      {
        key: "full-house",
        title: "Full House",
        description: "Played a game with all 8 slots filled",
        earned: false, // computed below
      },
      {
        key: "clean-slate",
        title: "Clean Slate",
        description: "No pending dues right now",
        earned: owePaise === 0 && gamesPlayed > 0,
      },
    ];

    // full-house check: any game with 8 attendees where I attended
    const fullHouseGame = attendedBookings.some((b) => {
      const attendeeCount = here.filter((r) => r.bookingId === b.id).length;
      return attendeeCount >= 8;
    });
    achievements[4].earned = fullHouseGame;

    return {
      hasData: true as const,
      gamesPlayed,
      attendancePct,
      moneyPaidPaise,
      moneyReceivedPaise,
      owePaise,
      owedPaise,
      avgCostPaise,
      venueBreakdown,
      monthly,
      mostActive,
      totalCrewGames: new Set(here.map((r) => r.bookingId)).size,
      achievements,
    };
  }),
});

export const searchRouter = createRouter({
  query: authedQuery
    .input(z.object({ q: z.string().trim().min(1).max(80) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const q = input.q.toLowerCase();

      const bookingRows = (
        await db.query.bookings.findMany({
          where: and(eq(bookings.groupId, group.id), ne(bookings.status, "cancelled")),
          orderBy: desc(bookings.startsAt),
          limit: 300,
        })
      )
        .filter((b) => b.venue.toLowerCase().includes(q) || b.notes?.toLowerCase().includes(q))
        .slice(0, 8)
        .map((b) => ({
          id: b.id,
          sport: b.sport,
          venue: b.venue,
          startsAt: b.startsAt,
        }));

      const memberRows = (
        await db.query.groupMembers.findMany({
          where: eq(groupMembers.groupId, group.id),
          with: { user: true },
        })
      )
        .filter((m) => m.user.name?.toLowerCase().includes(q))
        .slice(0, 6)
        .map((m) => ({
          id: m.user.id,
          name: m.user.name ?? "Player",
          avatar: m.user.avatar,
        }));

      const paymentRows = (
        await db.query.payments.findMany({
          where: eq(payments.groupId, group.id),
          with: { fromUser: true, toUser: true },
          orderBy: desc(payments.createdAt),
          limit: 200,
        })
      )
        .filter(
          (p) =>
            p.note?.toLowerCase().includes(q) ||
            p.fromUser.name?.toLowerCase().includes(q) ||
            p.toUser.name?.toLowerCase().includes(q),
        )
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          fromName: p.fromUser.name,
          toName: p.toUser.name,
          amountPaise: p.amountPaise,
          status: p.status,
          createdAt: p.createdAt,
        }));

      return { bookings: bookingRows, members: memberRows, payments: paymentRows };
    }),
});
