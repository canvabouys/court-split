import { z } from "zod";
import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { attendance, bookings, contributions, groupMembers, splits } from "@db/schema";
import { computeShares, type SplitType } from "@contracts/settlement";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { getWorkspace, MAX_PLAYERS_PER_GAME } from "../lib/workspace";
import { requireAdmin } from "../lib/access";
import { logActivity } from "../lib/notify";

type Db = ReturnType<typeof getDb>;

interface SplitConfig {
  customPaise?: Record<number, number>;
  weights?: Record<number, number>;
}

function parseSplitConfig(raw: string | null): SplitConfig {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SplitConfig;
  } catch {
    return {};
  }
}

/** Recomputes the splits table for a booking from attendance + split config. */
async function recomputeSplits(db: Db, bookingId: number) {
  const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  if (!booking) return;
  const rows = await db.query.attendance.findMany({
    where: and(eq(attendance.bookingId, bookingId), eq(attendance.attended, true)),
  });
  // Preserve the admin's "settled" marks across recomputation.
  const prev = await db.query.splits.findMany({ where: eq(splits.bookingId, bookingId) });
  const settledBefore = new Map(prev.map((p) => [p.userId, p.settled]));
  await db.delete(splits).where(eq(splits.bookingId, bookingId));
  const config = parseSplitConfig(booking.splitConfig);
  // Court cost + shuttle expense — split across everyone marked present.
  const totalPaise = booking.costPaise + (booking.shuttleCostPaise ?? 0);
  const shares = computeShares(
    totalPaise,
    rows.map((r) => r.userId),
    booking.splitType as SplitType,
    config,
  );
  if (shares.length > 0) {
    await db.insert(splits).values(
      shares.map((s) => ({
        bookingId,
        userId: s.userId,
        amountPaise: s.amountPaise,
        settled: settledBefore.get(s.userId) ?? false,
      })),
    );
  }
}

const bookingInput = z.object({
  venue: z.string().trim().min(2, "Enter the venue").max(160),
  startsAt: z.date(),
  durationMin: z.number().int().min(30, "A game is at least 30 minutes").max(600),
  costPaise: z.number().int().min(0).max(100_000_00),
  notes: z.string().trim().max(1000).optional(),
  attendeeIds: z.array(z.number()).max(MAX_PLAYERS_PER_GAME).optional(),
});

export const bookingsRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        scope: z.enum(["upcoming", "past", "all"]).default("all"),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const now = new Date();

      const rows = await db.query.bookings.findMany({
        where: and(eq(bookings.groupId, group.id), ne(bookings.status, "cancelled")),
        with: { bookedBy: true, attendance: true, splits: true, contributions: true },
        orderBy: desc(bookings.startsAt),
        limit: 500,
      });

      // A game is "past" once its start time has passed, regardless of stored status.
      const isPast = (b: (typeof rows)[number]) => b.startsAt < now;
      const filtered =
        input.scope === "upcoming"
          ? rows.filter((b) => !isPast(b)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
          : input.scope === "past"
            ? rows.filter(isPast)
            : rows;

      return filtered.slice(input.offset, input.offset + input.limit).map((b) => {
        const attendees = b.attendance.filter((a) => a.attended);
        const myShare = b.splits.find((s) => s.userId === ctx.user!.id);
        return {
          id: b.id,
          sport: b.sport,
          venue: b.venue,
          startsAt: b.startsAt,
          durationMin: b.durationMin,
          costPaise: b.costPaise,
          status: isPast(b) ? ("played" as const) : b.status,
          splitType: b.splitType,
          bookedBy: { id: b.bookedBy.id, name: b.bookedBy.name, avatar: b.bookedBy.avatar },
          attendeeCount: attendees.length,
          mySharePaise: myShare?.amountPaise ?? null,
          perPersonPaise:
            b.splits.length > 0
              ? Math.round(b.splits.reduce((a, s) => a + s.amountPaise, 0) / b.splits.length)
              : null,
        };
      });
    }),

  upcoming: authedQuery
    .input(z.object({ limit: z.number().int().min(1).max(20).default(6) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const rows = await db.query.bookings.findMany({
        where: and(
          eq(bookings.groupId, group.id),
          ne(bookings.status, "cancelled"),
          gte(bookings.startsAt, new Date()),
        ),
        with: { bookedBy: true, attendance: true },
        orderBy: asc(bookings.startsAt),
        limit: input.limit,
      });
      return rows.map((b) => ({
        id: b.id,
        sport: b.sport,
        venue: b.venue,
        startsAt: b.startsAt,
        durationMin: b.durationMin,
        costPaise: b.costPaise,
        status: b.status,
        bookedByName: b.bookedBy.name,
        attendeeCount: b.attendance.filter((a) => a.attended).length,
        iAttend: b.attendance.some((a) => a.userId === ctx.user!.id && a.attended),
      }));
    }),

  create: authedQuery.input(bookingInput).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx);
    const db = getDb();
    const { group, user } = await getWorkspace(ctx.wsMode);

    const members = await db.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, group.id),
    });
    const memberIds = new Set(members.map((m) => m.userId));
    const attendeeIds = (input.attendeeIds ?? [...memberIds]).filter((id) => memberIds.has(id));
    if (attendeeIds.length > MAX_PLAYERS_PER_GAME) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Badminton games allow at most ${MAX_PLAYERS_PER_GAME} players.`,
      });
    }

    const [{ id }] = await db
      .insert(bookings)
      .values({
        groupId: group.id,
        sport: "Badminton",
        venue: input.venue,
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        costPaise: input.costPaise,
        bookedById: user.id,
        notes: input.notes ?? null,
        splitType: "equal",
        status: input.startsAt.getTime() < Date.now() ? "played" : "scheduled",
      })
      .$returningId();

    await db.insert(attendance).values(
      attendeeIds.map((userId) => ({ bookingId: id, userId, attended: true })),
    );
    // The booker pays the full amount up-front by default.
    await db
      .insert(contributions)
      .values({ bookingId: id, userId: user.id, amountPaise: input.costPaise });
    await recomputeSplits(db, id);

    await logActivity(user.id, "booking.created", `booked Badminton at ${input.venue}`, group.id);
    return { id };
  }),

  get: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const db = getDb();
    const { group } = await getWorkspace(ctx.wsMode);
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, input.id),
      with: {
        bookedBy: true,
        attendance: { with: { user: true } },
        contributions: { with: { user: true } },
        splits: { with: { user: true } },
      },
    });
    if (!booking || booking.groupId !== group.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
    }

    const members = await db.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, group.id),
      with: { user: true },
    });

    const nameOverrideOf = new Map(
      booking.attendance.filter((a) => a.nameOverride).map((a) => [a.userId, a.nameOverride!]),
    );
    const played = booking.status === "played" || booking.startsAt < new Date();

    return {
      id: booking.id,
      sport: booking.sport,
      venue: booking.venue,
      startsAt: booking.startsAt,
      durationMin: booking.durationMin,
      costPaise: booking.costPaise,
      shuttleCostPaise: booking.shuttleCostPaise ?? 0,
      notes: booking.notes,
      splitType: booking.splitType,
      splitConfig: parseSplitConfig(booking.splitConfig),
      status: played ? "played" : booking.status,
      bookedBy: {
        id: booking.bookedBy.id,
        name: booking.bookedBy.name,
        avatar: booking.bookedBy.avatar,
      },
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        avatar: m.user.avatar,
      })),
      attendance: booking.attendance.map((a) => ({
        userId: a.userId,
        name: a.nameOverride ?? a.user.name,
        rosterName: a.user.name,
        avatar: a.user.avatar,
        attended: a.attended,
        nameOverride: a.nameOverride,
      })),
      contributions: booking.contributions.map((c) => ({
        userId: c.userId,
        name: nameOverrideOf.get(c.userId) ?? c.user.name,
        avatar: c.user.avatar,
        amountPaise: c.amountPaise,
      })),
      splits: booking.splits.map((s) => ({
        userId: s.userId,
        name: nameOverrideOf.get(s.userId) ?? s.user.name,
        avatar: s.user.avatar,
        amountPaise: s.amountPaise,
        settled: s.settled,
      })),
    };
  }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        venue: z.string().trim().min(2).max(160).optional(),
        startsAt: z.date().optional(),
        durationMin: z.number().int().min(30).max(600).optional(),
        costPaise: z.number().int().min(0).max(100_000_00).optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, input.id) });
      if (!booking || booking.groupId !== group.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const { id, ...fields } = input;
      await db
        .update(bookings)
        .set({
          ...(fields.venue ? { venue: fields.venue } : {}),
          ...(fields.startsAt ? { startsAt: fields.startsAt } : {}),
          ...(fields.durationMin ? { durationMin: fields.durationMin } : {}),
          ...(fields.costPaise !== undefined ? { costPaise: fields.costPaise } : {}),
          ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
          ...(fields.startsAt ? { status: fields.startsAt < new Date() ? "played" : "scheduled" } : {}),
        })
        .where(eq(bookings.id, id));
      if (fields.costPaise !== undefined) await recomputeSplits(db, id);
      await logActivity(ctx.user.id, "booking.updated", "updated a booking", group.id);
      return { ok: true };
    }),

  setAttendance: authedQuery
    .input(
      z.object({
        id: z.number(),
        attendance: z.array(z.object({ userId: z.number(), attended: z.boolean() })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, input.id) });
      if (!booking || booking.groupId !== group.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const attending = input.attendance.filter((a) => a.attended).length;
      if (attending > MAX_PLAYERS_PER_GAME) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Badminton games allow at most ${MAX_PLAYERS_PER_GAME} players.`,
        });
      }

      for (const row of input.attendance) {
        await db
          .insert(attendance)
          .values({ bookingId: input.id, userId: row.userId, attended: row.attended })
          .onDuplicateKeyUpdate({ set: { attended: row.attended } });
      }
      await recomputeSplits(db, input.id);
      await logActivity(ctx.user.id, "booking.attendance", "updated attendance", group.id);
      return { ok: true };
    }),

  setSplitConfig: authedQuery
    .input(
      z.object({
        id: z.number(),
        splitType: z.enum(["equal", "custom", "percentage", "weighted"]),
        customPaise: z.record(z.string(), z.number()).optional(),
        weights: z.record(z.string(), z.number()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, input.id) });
      if (!booking || booking.groupId !== group.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const config: SplitConfig = {};
      if (input.customPaise) {
        config.customPaise = Object.fromEntries(
          Object.entries(input.customPaise).map(([k, v]) => [Number(k), Math.round(v)]),
        );
      }
      if (input.weights) {
        config.weights = Object.fromEntries(
          Object.entries(input.weights).map(([k, v]) => [Number(k), v]),
        );
      }
      await db
        .update(bookings)
        .set({ splitType: input.splitType, splitConfig: JSON.stringify(config) })
        .where(eq(bookings.id, input.id));
      await recomputeSplits(db, input.id);
      return { ok: true };
    }),

  setContributions: authedQuery
    .input(
      z.object({
        id: z.number(),
        contributions: z.array(
          z.object({ userId: z.number(), amountPaise: z.number().int().min(0) }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, input.id) });
      if (!booking || booking.groupId !== group.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const total = input.contributions.reduce((a, c) => a + c.amountPaise, 0);
      const expected = booking.costPaise + (booking.shuttleCostPaise ?? 0);
      if (total !== expected) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contributions must add up to the total cost (court + shuttles).",
        });
      }
      await db.delete(contributions).where(eq(contributions.bookingId, input.id));
      const rows = input.contributions.filter((c) => c.amountPaise > 0);
      if (rows.length > 0) {
        await db.insert(contributions).values(rows.map((c) => ({ bookingId: input.id, ...c })));
      }
      await logActivity(ctx.user.id, "booking.contributions", "updated who paid", group.id);
      return { ok: true };
    }),

  /** Admin: record (or clear) the shuttlecock expense — split among everyone present. */
  setShuttles: authedQuery
    .input(
      z.object({
        id: z.number(),
        shuttleCostPaise: z.number().int().min(0).max(1_000_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, input.id) });
      if (!booking || booking.groupId !== group.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const prev = booking.shuttleCostPaise ?? 0;
      const delta = input.shuttleCostPaise - prev;
      await db
        .update(bookings)
        .set({ shuttleCostPaise: input.shuttleCostPaise })
        .where(eq(bookings.id, input.id));

      // Keep the up-front payments in sync: the booker is assumed to have
      // bought the shuttles too, so their contribution moves by the delta.
      if (delta !== 0) {
        const bookerRow = await db.query.contributions.findFirst({
          where: and(
            eq(contributions.bookingId, input.id),
            eq(contributions.userId, booking.bookedById),
          ),
        });
        if (bookerRow) {
          await db
            .update(contributions)
            .set({ amountPaise: Math.max(0, bookerRow.amountPaise + delta) })
            .where(eq(contributions.id, bookerRow.id));
        } else if (delta > 0) {
          await db
            .insert(contributions)
            .values({ bookingId: input.id, userId: booking.bookedById, amountPaise: delta });
        }
      }

      await recomputeSplits(db, input.id);
      await logActivity(ctx.user.id, "booking.shuttles", "updated shuttle cost", group.id);
      return { ok: true };
    }),

  /** Admin: rename a player for this booking only (guest fill-ins, spelling). */
  renameAttendee: authedQuery
    .input(
      z.object({
        id: z.number(),
        userId: z.number(),
        name: z.string().trim().min(1, "Enter a name").max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, input.id) });
      if (!booking || booking.groupId !== group.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const row = await db.query.attendance.findFirst({
        where: and(eq(attendance.bookingId, input.id), eq(attendance.userId, input.userId)),
        with: { user: true },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Player not in this game." });
      // Same as the roster name → clear the override instead of storing it.
      const override = input.name === row.user.name ? null : input.name;
      await db
        .update(attendance)
        .set({ nameOverride: override })
        .where(eq(attendance.id, row.id));
      return { ok: true };
    }),

  /** Admin: add a roster player to this game (they join the attendance list). */
  addAttendee: authedQuery
    .input(z.object({ id: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, input.id) });
      if (!booking || booking.groupId !== group.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const existing = await db.query.attendance.findMany({
        where: and(eq(attendance.bookingId, input.id), eq(attendance.attended, true)),
      });
      if (existing.length >= MAX_PLAYERS_PER_GAME) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Badminton games allow at most ${MAX_PLAYERS_PER_GAME} players.`,
        });
      }
      await db
        .insert(attendance)
        .values({ bookingId: input.id, userId: input.userId, attended: true })
        .onDuplicateKeyUpdate({ set: { attended: true } });
      await recomputeSplits(db, input.id);
      return { ok: true };
    }),

  /** Admin: mark an attendee's share for this game as paid / not paid. */
  setSplitSettled: authedQuery
    .input(z.object({ id: z.number(), userId: z.number(), settled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, input.id) });
      if (!booking || booking.groupId !== group.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await db
        .update(splits)
        .set({ settled: input.settled })
        .where(and(eq(splits.bookingId, input.id), eq(splits.userId, input.userId)));
      return { ok: true };
    }),

  delete: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx);
    const db = getDb();
    const { group } = await getWorkspace(ctx.wsMode);
    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, input.id) });
    if (!booking || booking.groupId !== group.id) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    await db.transaction(async (tx) => {
      await tx.delete(splits).where(eq(splits.bookingId, input.id));
      await tx.delete(contributions).where(eq(contributions.bookingId, input.id));
      await tx.delete(attendance).where(eq(attendance.bookingId, input.id));
      await tx.delete(bookings).where(eq(bookings.id, input.id));
    });
    await logActivity(ctx.user.id, "booking.deleted", "deleted a booking", group.id);
    return { ok: true };
  }),
});
