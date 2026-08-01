import { z } from "zod";
import { and, eq, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import {
  attendance,
  bookings,
  contributions,
  groupMembers,
  payments,
  users,
} from "@db/schema";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { getWorkspace, MAX_ROSTER_SIZE } from "../lib/workspace";
import { requireAdmin } from "../lib/access";
import { logActivity } from "../lib/notify";

export const playersRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const { group, user } = await getWorkspace(ctx.wsMode);

    const members = await db.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, group.id),
      with: { user: true },
    });

    // games played per member (attended games in this workspace)
    const groupBookings = await db.query.bookings.findMany({
      where: eq(bookings.groupId, group.id),
    });
    const bookingIds = new Set(groupBookings.map((b) => b.id));
    const attendanceRows = await db.query.attendance.findMany({
      where: eq(attendance.attended, true),
    });
    const gamesPlayed = new Map<number, number>();
    for (const a of attendanceRows) {
      if (!bookingIds.has(a.bookingId)) continue;
      gamesPlayed.set(a.userId, (gamesPlayed.get(a.userId) ?? 0) + 1);
    }

    return members
      .map((m) => ({
        userId: m.userId,
        name: m.user.name ?? "Player",
        avatar: m.user.avatar,
        upiId: m.user.upiId,
        isOwner: m.userId === user.id,
        joinedAt: m.joinedAt,
        gamesPlayed: gamesPlayed.get(m.userId) ?? 0,
      }))
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed);
  }),

  add: authedQuery
    .input(
      z.object({
        name: z.string().trim().min(1, "Enter the player's name").max(80),
        upiId: z
          .string()
          .trim()
          .regex(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/, "Enter a valid UPI ID like name@bank")
          .max(120)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);

      const count = await db.$count(groupMembers, eq(groupMembers.groupId, group.id));
      if (count >= MAX_ROSTER_SIZE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Badminton games cap at ${MAX_ROSTER_SIZE} players — remove someone before adding ${input.name}.`,
        });
      }

      const [{ id: playerId }] = await db
        .insert(users)
        .values({
          unionId: `player_${nanoid(10)}`,
          name: input.name,
          upiId: input.upiId ?? null,
          role: "user",
        })
        .$returningId();
      await db.insert(groupMembers).values({ groupId: group.id, userId: playerId, role: "member" });
      await logActivity((await getWorkspace(ctx.wsMode)).user.id, "player.added", `added ${input.name}`, group.id);
      return { userId: playerId };
    }),

  update: authedQuery
    .input(
      z.object({
        userId: z.number(),
        name: z.string().trim().min(1).max(80).optional(),
        upiId: z
          .string()
          .trim()
          .regex(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/, "Enter a valid UPI ID like name@bank")
          .max(120)
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const member = await db.query.groupMembers.findFirst({
        where: and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, input.userId)),
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Player not found." });
      await db
        .update(users)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.upiId !== undefined ? { upiId: input.upiId } : {}),
        })
        .where(eq(users.id, input.userId));
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group, user } = await getWorkspace(ctx.wsMode);
      if (input.userId === user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't remove yourself." });
      }
      const member = await db.query.groupMembers.findFirst({
        where: and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, input.userId)),
        with: { user: true },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Player not found." });

      // Block removal when the player has history — their games must stay intact.
      const groupBookings = await db.query.bookings.findMany({
        where: eq(bookings.groupId, group.id),
      });
      const bookingIds = groupBookings.map((b) => b.id);
      if (bookingIds.length > 0) {
        const [att, contrib] = await Promise.all([
          db.query.attendance.findFirst({
            where: and(
              inArray(attendance.bookingId, bookingIds),
              eq(attendance.userId, input.userId),
            ),
          }),
          db.query.contributions.findFirst({
            where: and(
              inArray(contributions.bookingId, bookingIds),
              eq(contributions.userId, input.userId),
            ),
          }),
        ]);
        const pay = await db.query.payments.findFirst({
          where: and(
            eq(payments.groupId, group.id),
            eq(payments.status, "completed"),
            or(eq(payments.fromUserId, input.userId), eq(payments.toUserId, input.userId)),
          ),
        });
        if (att || contrib || pay) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${member.user.name ?? "This player"} has game or payment history and can't be removed.`,
          });
        }
      }

      await db.delete(groupMembers).where(eq(groupMembers.id, member.id));
      await db.delete(users).where(eq(users.id, input.userId));
      await logActivity(user.id, "player.removed", `removed ${member.user.name ?? "a player"}`, group.id);
      return { ok: true };
    }),
});
