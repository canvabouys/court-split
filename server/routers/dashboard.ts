import { and, desc, eq, gte, ne } from "drizzle-orm";
import { z } from "zod";
import { activityLogs, bookings, payments, splits } from "@db/schema";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { getWorkspace } from "../lib/workspace";
import { computeGroupLedger } from "../lib/balances";

function monthStart(offset = 0): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

export const dashboardRouter = createRouter({
  summary: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const { group } = await getWorkspace(ctx.wsMode);
    const gid = group.id;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

    const ledger = await computeGroupLedger(gid);
    const bal = ledger.balances.get(ctx.user.id) ?? 0;
    const youOwePaise = bal < 0 ? -bal : 0;
    const owedToYouPaise = bal > 0 ? bal : 0;

    const mySplits = await db.query.splits.findMany({
      where: eq(splits.userId, ctx.user.id),
      with: { booking: true },
    });
    const mySplitsHere = mySplits.filter((s) => s.booking.groupId === gid);

    const startOfThisMonth = monthStart(0);
    const monthSpendPaise = mySplitsHere
      .filter((s) => s.booking.startsAt >= startOfThisMonth)
      .reduce((a, s) => a + s.amountPaise, 0);

    const monthlySpend: { month: string; paise: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = monthStart(-i);
      const end = monthStart(-i + 1);
      monthlySpend.push({
        month: start.toLocaleString("en-US", { month: "short" }),
        paise: mySplitsHere
          .filter((s) => s.booking.startsAt >= start && s.booking.startsAt < end)
          .reduce((a, s) => a + s.amountPaise, 0),
      });
    }

    const receivedRows = await db.query.payments.findMany({
      where: and(
        eq(payments.groupId, gid),
        eq(payments.toUserId, ctx.user.id),
        eq(payments.status, "completed"),
        gte(payments.createdAt, startOfThisMonth),
      ),
    });
    const monthReceivedPaise = receivedRows.reduce((a, p) => a + p.amountPaise, 0);

    const monthBookings = await db.query.bookings.findMany({
      where: and(
        eq(bookings.groupId, gid),
        ne(bookings.status, "cancelled"),
        gte(bookings.startsAt, startOfThisMonth),
      ),
    });

    const pending = await db.query.payments.findMany({
      where: and(eq(payments.groupId, gid), eq(payments.status, "pending")),
    });

    const allGames = await db.query.bookings.findMany({
      where: and(eq(bookings.groupId, gid), ne(bookings.status, "cancelled")),
      with: { attendance: true, bookedBy: true },
      orderBy: bookings.startsAt,
    });

    const serializeGame = (b: (typeof allGames)[number]) => ({
      id: b.id,
      sport: b.sport,
      venue: b.venue,
      startsAt: b.startsAt,
      durationMin: b.durationMin,
      costPaise: b.costPaise,
      status: b.startsAt < now ? "played" : b.status,
      bookedByName: b.bookedBy.name,
      attendeeCount: b.attendance.filter((a) => a.attended).length,
      iAttend: b.attendance.some((a) => a.userId === ctx.user.id && a.attended),
    });

    const logs = await db.query.activityLogs.findMany({
      where: eq(activityLogs.groupId, gid),
      with: { user: true },
      orderBy: desc(activityLogs.createdAt),
      limit: 12,
    });

    return {
      hasData: true,
      youOwePaise,
      owedToYouPaise,
      monthSpendPaise,
      monthReceivedPaise,
      gamesThisMonth: monthBookings.length,
      totalGames: allGames.length,
      pendingPaymentsCount: pending.length,
      todaysGames: allGames
        .filter((b) => b.startsAt >= todayStart && b.startsAt < tomorrowStart)
        .map(serializeGame),
      upcoming: allGames.filter((b) => b.startsAt >= now).slice(0, 6).map(serializeGame),
      activity: logs.map((l) => ({
        id: l.id,
        action: l.action,
        detail: l.detail,
        createdAt: l.createdAt,
        userName: l.user.name ?? "Someone",
        userAvatar: l.user.avatar,
        isMe: l.userId === ctx.user.id,
      })),
      monthlySpend,
    };
  }),
});

export const activityRouter = createRouter({
  list: authedQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(25) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const rows = await db.query.activityLogs.findMany({
        where: eq(activityLogs.groupId, group.id),
        with: { user: true },
        orderBy: desc(activityLogs.createdAt),
        limit: input.limit,
      });
      return rows.map((l) => ({
        id: l.id,
        action: l.action,
        detail: l.detail,
        createdAt: l.createdAt,
        userName: l.user.name ?? "Someone",
        userAvatar: l.user.avatar,
        isMe: l.userId === ctx.user.id,
      }));
    }),
});
