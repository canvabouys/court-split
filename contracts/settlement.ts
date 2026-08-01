/**
 * CourtSplit settlement engine.
 *
 * Pure functions shared by the API (source of truth) and the client
 * (live previews in the split editor). All amounts are integer paise.
 */

export type SplitType = "equal" | "custom" | "percentage" | "weighted";

export interface Share {
  userId: number;
  amountPaise: number;
}

/**
 * Distribute `totalPaise` across participants according to the split type.
 * Remainders from rounding are distributed one paise at a time to the
 * largest shares so the result always sums exactly to `totalPaise`.
 *
 * - equal:      everyone pays the same (±1 paise)
 * - custom:     explicit amounts; scaled to fit if they don't sum to total
 * - percentage: weights are percentages (should sum to ~100)
 * - weighted:   arbitrary weights (e.g. hours played, guests brought)
 */
export function computeShares(
  totalPaise: number,
  participantIds: number[],
  splitType: SplitType,
  params: { customPaise?: Record<number, number>; weights?: Record<number, number> } = {},
): Share[] {
  if (participantIds.length === 0 || totalPaise <= 0) return [];

  if (splitType === "custom" && params.customPaise) {
    const sum = participantIds.reduce(
      (acc, id) => acc + Math.max(0, Math.round(params.customPaise![id] ?? 0)),
      0,
    );
    if (sum === totalPaise) {
      return participantIds.map((id) => ({
        userId: id,
        amountPaise: Math.max(0, Math.round(params.customPaise![id] ?? 0)),
      }));
    }
    if (sum > 0) {
      // Scale custom amounts proportionally to match the real total.
      return distributeByWeights(
        totalPaise,
        participantIds.map((id) => ({
          userId: id,
          weight: Math.max(0, params.customPaise![id] ?? 0),
        })),
      );
    }
    // All zeros → fall back to equal.
  }

  if (splitType === "percentage" || splitType === "weighted") {
    const weights = participantIds.map((id) => ({
      userId: id,
      weight: Math.max(0, params.weights?.[id] ?? (splitType === "percentage" ? 0 : 1)),
    }));
    const totalWeight = weights.reduce((a, w) => a + w.weight, 0);
    if (totalWeight > 0) return distributeByWeights(totalPaise, weights);
  }

  // equal split with largest-remainder rounding
  const n = participantIds.length;
  const base = Math.floor(totalPaise / n);
  let remainder = totalPaise - base * n;
  return participantIds.map((id) => ({
    userId: id,
    amountPaise: base + (remainder-- > 0 ? 1 : 0),
  }));
}

function distributeByWeights(
  totalPaise: number,
  entries: { userId: number; weight: number }[],
): Share[] {
  const totalWeight = entries.reduce((a, e) => a + e.weight, 0);
  if (totalWeight <= 0) return entries.map((e) => ({ userId: e.userId, amountPaise: 0 }));

  const raw = entries.map((e) => ({
    userId: e.userId,
    exact: (totalPaise * e.weight) / totalWeight,
  }));
  const floored = raw.map((r) => ({ userId: r.userId, amountPaise: Math.floor(r.exact) }));
  let remainder = totalPaise - floored.reduce((a, f) => a + f.amountPaise, 0);

  // hand out remaining paise to the largest fractional parts
  raw
    .map((r, i) => ({ i, frac: r.exact - Math.floor(r.exact) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (remainder > 0) {
        floored[i].amountPaise += 1;
        remainder -= 1;
      }
    });
  return floored;
}

/* ------------------------------------------------------------------ */
/* Balances & optimal settlement plan                                  */
/* ------------------------------------------------------------------ */

export interface BookingLedgerInput {
  bookingId: number;
  /** paise paid up-front, per user */
  contributions: { userId: number; amountPaise: number }[];
  /** paise owed as share, per user (attendees only) */
  shares: { userId: number; amountPaise: number }[];
}

export interface PaymentLedgerInput {
  fromUserId: number;
  toUserId: number;
  amountPaise: number;
}

/** Positive ⇒ the user is owed money. Negative ⇒ the user owes money. */
export type BalanceMap = Map<number, number>;

export function computeNetBalances(
  bookings: BookingLedgerInput[],
  payments: PaymentLedgerInput[],
): BalanceMap {
  const balances: BalanceMap = new Map();
  const add = (id: number, delta: number) =>
    balances.set(id, (balances.get(id) ?? 0) + delta);

  for (const b of bookings) {
    for (const c of b.contributions) add(c.userId, c.amountPaise);
    for (const s of b.shares) add(s.userId, -s.amountPaise);
  }
  for (const p of payments) {
    add(p.fromUserId, p.amountPaise);
    add(p.toUserId, -p.amountPaise);
  }
  // zero out dust
  for (const [k, v] of balances) if (Math.abs(v) < 1) balances.set(k, 0);
  return balances;
}

export interface SettlementTransaction {
  fromUserId: number;
  toUserId: number;
  amountPaise: number;
}

/**
 * Greedy max-creditor ↔ max-debtor matching. Produces at most n−1
 * transactions and always settles every balance exactly.
 */
export function optimalSettlement(balances: BalanceMap): SettlementTransaction[] {
  const creditors = [...balances.entries()]
    .filter(([, v]) => v > 0)
    .map(([userId, amountPaise]) => ({ userId, amountPaise }))
    .sort((a, b) => b.amountPaise - a.amountPaise);
  const debtors = [...balances.entries()]
    .filter(([, v]) => v < 0)
    .map(([userId, amountPaise]) => ({ userId, amountPaise: -amountPaise }))
    .sort((a, b) => b.amountPaise - a.amountPaise);

  const plan: SettlementTransaction[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amountPaise, creditor.amountPaise);
    if (amount > 0) {
      plan.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountPaise: amount });
    }
    debtor.amountPaise -= amount;
    creditor.amountPaise -= amount;
    if (debtor.amountPaise <= 0) i++;
    if (creditor.amountPaise <= 0) j++;
  }
  return plan;
}

/* ------------------------------------------------------------------ */
/* Pairwise ledger — "Rahul owes you ₹50" running balances             */
/* ------------------------------------------------------------------ */

export interface PairDebt {
  fromUserId: number;
  toUserId: number;
  amountPaise: number;
}

/**
 * Builds netted pairwise debts. For every booking, each attendee owes each
 * payer their proportional slice of that payer's contribution. Completed
 * payments reduce the pair. Opposite directions on the same pair cancel
 * out, so across many games only the running difference remains.
 */
export function computePairwiseDebts(
  bookings: BookingLedgerInput[],
  payments: PaymentLedgerInput[],
): PairDebt[] {
  const pair = new Map<string, number>();
  const key = (a: number, b: number) => `${a}>${b}`;
  const add = (from: number, to: number, delta: number) => {
    if (from === to) return;
    pair.set(key(from, to), (pair.get(key(from, to)) ?? 0) + delta);
  };

  for (const b of bookings) {
    const totalPaid = b.contributions.reduce((a, c) => a + c.amountPaise, 0);
    if (totalPaid <= 0) continue;
    for (const share of b.shares) {
      for (const c of b.contributions) {
        if (share.userId === c.userId) continue;
        const slice = Math.round((share.amountPaise * c.amountPaise) / totalPaid);
        if (slice > 0) add(share.userId, c.userId, slice);
      }
    }
  }
  for (const p of payments) add(p.fromUserId, p.toUserId, -p.amountPaise);

  // Net opposite directions
  const seen = new Set<string>();
  const result: PairDebt[] = [];
  for (const [k, v] of pair) {
    if (seen.has(k)) continue;
    const [a, b] = k.split(">").map(Number);
    const reverseKey = key(b, a);
    seen.add(k);
    seen.add(reverseKey);
    const net = v - (pair.get(reverseKey) ?? 0);
    if (net > 0) result.push({ fromUserId: a, toUserId: b, amountPaise: net });
    else if (net < 0) result.push({ fromUserId: b, toUserId: a, amountPaise: -net });
  }
  return result.sort((x, y) => y.amountPaise - x.amountPaise);
}
