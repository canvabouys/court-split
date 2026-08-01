import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { groupMembers, payments, users } from "@db/schema";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { getWorkspace } from "../lib/workspace";
import { requireAdmin } from "../lib/access";
import { computeGroupLedger } from "../lib/balances";
import { logActivity } from "../lib/notify";

export const paymentsRouter = createRouter({
  /** Balances, pairwise debts and the optimized plan for the workspace. */
  settlement: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const { group } = await getWorkspace(ctx.wsMode);

    const ledger = await computeGroupLedger(group.id);
    const members = await db.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, group.id),
      with: { user: true },
    });
    const nameOf = new Map(members.map((m) => [m.userId, m.user.name ?? "Player"]));
    const avatarOf = new Map(members.map((m) => [m.userId, m.user.avatar]));

    const decorate = (t: { fromUserId: number; toUserId: number; amountPaise: number }) => ({
      ...t,
      fromName: nameOf.get(t.fromUserId) ?? "Player",
      toName: nameOf.get(t.toUserId) ?? "Player",
      fromAvatar: avatarOf.get(t.fromUserId) ?? null,
      toAvatar: avatarOf.get(t.toUserId) ?? null,
      involvesMe: t.fromUserId === ctx.user.id || t.toUserId === ctx.user.id,
    });

    return {
      myBalancePaise: ledger.balances.get(ctx.user.id) ?? 0,
      balances: members.map((m) => ({
        userId: m.userId,
        name: nameOf.get(m.userId)!,
        avatar: avatarOf.get(m.userId) ?? null,
        balancePaise: ledger.balances.get(m.userId) ?? 0,
      })),
      pairwise: ledger.pairwise.map(decorate),
      plan: ledger.plan.map(decorate),
    };
  }),

  /** Everything payment-related for the workspace owner. */
  overview: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const { group } = await getWorkspace(ctx.wsMode);

    const rows = await db.query.payments.findMany({
      where: eq(payments.groupId, group.id),
      with: { fromUser: true, toUser: true },
      orderBy: desc(payments.createdAt),
      limit: 300,
    });

    const ledger = await computeGroupLedger(group.id);

    const lookup = new Map<number, { name: string | null; avatar: string | null; upiId: string | null }>();
    const ensure = async (id: number) => {
      if (!lookup.has(id)) {
        const u = await db.query.users.findFirst({ where: eq(users.id, id) });
        lookup.set(id, { name: u?.name ?? "Player", avatar: u?.avatar ?? null, upiId: u?.upiId ?? null });
      }
      return lookup.get(id)!;
    };

    const youOwe = await Promise.all(
      ledger.pairwise
        .filter((d) => d.fromUserId === ctx.user.id)
        .map(async (d) => ({
          otherUserId: d.toUserId,
          other: await ensure(d.toUserId),
          amountPaise: d.amountPaise,
        })),
    );
    const owedToYou = await Promise.all(
      ledger.pairwise
        .filter((d) => d.toUserId === ctx.user.id)
        .map(async (d) => ({
          otherUserId: d.fromUserId,
          other: await ensure(d.fromUserId),
          amountPaise: d.amountPaise,
        })),
    );

    const serialize = (p: (typeof rows)[number]) => ({
      id: p.id,
      fromUser: { id: p.fromUser.id, name: p.fromUser.name, avatar: p.fromUser.avatar },
      toUser: { id: p.toUser.id, name: p.toUser.name, avatar: p.toUser.avatar },
      amountPaise: p.amountPaise,
      status: p.status,
      method: p.method,
      note: p.note,
      createdAt: p.createdAt,
      completedAt: p.completedAt,
    });

    return {
      youOwe: youOwe.sort((a, b) => b.amountPaise - a.amountPaise),
      owedToYou: owedToYou.sort((a, b) => b.amountPaise - a.amountPaise),
      pendingConfirmations: rows.filter((p) => p.status === "pending").map(serialize),
      history: rows.filter((p) => p.status !== "pending").map(serialize),
    };
  }),

  /** Payer records "I paid" → pending until recipient confirms. */
  create: authedQuery
    .input(
      z.object({
        toUserId: z.number(),
        amountPaise: z.number().int().min(1).max(100_000_00),
        method: z.enum(["upi", "cash", "other"]).default("upi"),
        note: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      if (input.toUserId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't pay yourself." });
      }
      const recipient = await db.query.users.findFirst({ where: eq(users.id, input.toUserId) });
      if (!recipient) throw new TRPCError({ code: "NOT_FOUND", message: "Recipient not found." });

      const [{ id }] = await db
        .insert(payments)
        .values({
          groupId: group.id,
          fromUserId: ctx.user.id,
          toUserId: input.toUserId,
          amountPaise: input.amountPaise,
          method: input.method,
          note: input.note ?? null,
          status: "pending",
        })
        .$returningId();
      await logActivity(ctx.user.id, "payment.initiated", `paid ${recipient.name ?? "a teammate"}`, group.id);
      return { id };
    }),

  /** Confirm a pending payment (single-player mode: owner confirms). */
  confirm: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const payment = await db.query.payments.findFirst({ where: eq(payments.id, input.id) });
      if (!payment || payment.groupId !== group.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (payment.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payment already resolved." });
      }
      await db
        .update(payments)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(payments.id, input.id));
      await logActivity(ctx.user.id, "payment.confirmed", undefined, group.id);
      return { ok: true };
    }),

  /** Directly record a completed payment (e.g. cash settled in person). */
  recordSettled: authedQuery
    .input(
      z.object({
        fromUserId: z.number(),
        toUserId: z.number(),
        amountPaise: z.number().int().min(1).max(100_000_00),
        note: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const [{ id }] = await db
        .insert(payments)
        .values({
          groupId: group.id,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          amountPaise: input.amountPaise,
          method: "cash",
          note: input.note ?? "Settled in person",
          status: "completed",
          completedAt: new Date(),
        })
        .$returningId();
      return { id };
    }),

  cancel: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = getDb();
      const { group } = await getWorkspace(ctx.wsMode);
      const payment = await db.query.payments.findFirst({ where: eq(payments.id, input.id) });
      if (!payment || payment.groupId !== group.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (payment.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payment already resolved." });
      }
      await db.update(payments).set({ status: "cancelled" }).where(eq(payments.id, input.id));
      return { ok: true };
    }),
});
