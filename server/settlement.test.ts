import { describe, expect, it } from "vitest";
import {
  computeNetBalances,
  computePairwiseDebts,
  computeShares,
  optimalSettlement,
} from "@contracts/settlement";

describe("computeShares", () => {
  it("splits ₹800 equally among 8 players", () => {
    const shares = computeShares(80000, [1, 2, 3, 4, 5, 6, 7, 8], "equal");
    expect(shares.every((s) => s.amountPaise === 10000)).toBe(true);
    expect(shares.reduce((a, s) => a + s.amountPaise, 0)).toBe(80000);
  });

  it("distributes remainder paise so the sum stays exact", () => {
    const shares = computeShares(80000, [1, 2, 3], "equal");
    expect(shares.reduce((a, s) => a + s.amountPaise, 0)).toBe(80000);
  });

  it("honours percentage splits", () => {
    const shares = computeShares(100000, [1, 2], "percentage", {
      weights: { 1: 75, 2: 25 },
    });
    expect(shares.find((s) => s.userId === 1)?.amountPaise).toBe(75000);
    expect(shares.find((s) => s.userId === 2)?.amountPaise).toBe(25000);
  });

  it("scales custom amounts that don't match the total", () => {
    const shares = computeShares(100000, [1, 2], "custom", {
      customPaise: { 1: 6000, 2: 2000 },
    });
    expect(shares.find((s) => s.userId === 1)?.amountPaise).toBe(75000);
    expect(shares.reduce((a, s) => a + s.amountPaise, 0)).toBe(100000);
  });
});

describe("optimalSettlement", () => {
  it("collapses a circular debt into zero transactions", () => {
    // A owes B 50, B owes C 50, C owes A 50 → all net to zero
    const balances = new Map([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(optimalSettlement(balances)).toHaveLength(0);
  });

  it("settles one payer with n-1 transactions", () => {
    // user 1 paid for everyone (net +700), users 2-8 each owe 100
    const balances = new Map<number, number>([[1, 70000]]);
    for (let i = 2; i <= 8; i++) balances.set(i, -10000);
    const plan = optimalSettlement(balances);
    expect(plan).toHaveLength(7);
    expect(plan.every((t) => t.toUserId === 1 && t.amountPaise === 10000)).toBe(true);
  });

  it("minimizes transactions across mixed balances", () => {
    const balances = new Map([
      [1, 30000],
      [2, -30000],
      [3, 20000],
      [4, -20000],
    ]);
    const plan = optimalSettlement(balances);
    expect(plan).toHaveLength(2);
  });
});

describe("running balances", () => {
  it("nets repeat games between the same people", () => {
    // Game 1: Rahul (1) paid ₹100, you (2) owe him ₹100
    // Game 2: you (2) paid ₹150, Rahul owes you ₹150
    // Net: Rahul owes you ₹50
    const bookings = [
      {
        bookingId: 1,
        contributions: [{ userId: 1, amountPaise: 10000 }],
        shares: [
          { userId: 1, amountPaise: 0 },
          { userId: 2, amountPaise: 10000 },
        ],
      },
      {
        bookingId: 2,
        contributions: [{ userId: 2, amountPaise: 15000 }],
        shares: [
          { userId: 2, amountPaise: 0 },
          { userId: 1, amountPaise: 15000 },
        ],
      },
    ];
    const pairwise = computePairwiseDebts(bookings, []);
    expect(pairwise).toHaveLength(1);
    expect(pairwise[0]).toEqual({ fromUserId: 1, toUserId: 2, amountPaise: 5000 });

    const balances = computeNetBalances(bookings, []);
    expect(balances.get(1)).toBe(-5000);
    expect(balances.get(2)).toBe(5000);
  });

  it("completed payments reduce the running balance", () => {
    const bookings = [
      {
        bookingId: 1,
        contributions: [{ userId: 1, amountPaise: 10000 }],
        shares: [{ userId: 2, amountPaise: 10000 }],
      },
    ];
    const payments = [{ fromUserId: 2, toUserId: 1, amountPaise: 10000 }];
    expect(computePairwiseDebts(bookings, payments)).toHaveLength(0);
    expect(computeNetBalances(bookings, payments).get(2)).toBe(0);
  });
});
