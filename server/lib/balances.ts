import { and, eq, ne } from "drizzle-orm";
import { bookings, payments } from "@db/schema";
import { getDb } from "../queries/connection";
import {
  computeNetBalances,
  computePairwiseDebts,
  optimalSettlement,
  type BalanceMap,
  type BookingLedgerInput,
  type PairDebt,
  type SettlementTransaction,
} from "@contracts/settlement";

export interface GroupLedger {
  balances: BalanceMap;
  pairwise: PairDebt[];
  plan: SettlementTransaction[];
}

/**
 * Loads every expense-relevant row for a group and derives net balances,
 * pairwise running debts and the optimized settlement plan.
 */
export async function computeGroupLedger(groupId: number): Promise<GroupLedger> {
  const db = getDb();

  const groupBookings = await db.query.bookings.findMany({
    where: and(eq(bookings.groupId, groupId), ne(bookings.status, "cancelled")),
  });
  const bookingIds = groupBookings.map((b) => b.id);

  const ledgerBookings: BookingLedgerInput[] = [];
  if (bookingIds.length > 0) {
    const [allSplits, allContributions] = await Promise.all([
      db.query.splits.findMany(),
      db.query.contributions.findMany(),
    ]);
    const idSet = new Set(bookingIds);
    for (const b of groupBookings) {
      ledgerBookings.push({
        bookingId: b.id,
        shares: allSplits
          .filter((s) => s.bookingId === b.id)
          .map((s) => ({ userId: s.userId, amountPaise: s.amountPaise })),
        contributions: allContributions
          .filter((c) => c.bookingId === b.id && idSet.has(c.bookingId))
          .map((c) => ({ userId: c.userId, amountPaise: c.amountPaise })),
      });
    }
  }

  const completedPayments = await db.query.payments.findMany({
    where: and(eq(payments.groupId, groupId), eq(payments.status, "completed")),
  });
  const ledgerPayments = completedPayments.map((p) => ({
    fromUserId: p.fromUserId,
    toUserId: p.toUserId,
    amountPaise: p.amountPaise,
  }));

  const balances = computeNetBalances(ledgerBookings, ledgerPayments);
  const pairwise = computePairwiseDebts(ledgerBookings, ledgerPayments);
  const plan = optimalSettlement(balances);
  return { balances, pairwise, plan };
}

/** Convenience: a single user's net balance inside a group. */
export async function userBalanceInGroup(groupId: number, userId: number) {
  const ledger = await computeGroupLedger(groupId);
  return ledger.balances.get(userId) ?? 0;
}
