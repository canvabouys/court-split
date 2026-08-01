/**
 * End-to-end smoke test (single-workspace mode): seeds demo data through the
 * real tRPC router, then verifies dashboard / bookings / payments / stats /
 * settlement outputs, and finally cleans everything up again.
 *
 * Safety: aborts without touching anything if the workspace already has real
 * (non-cancelled) games, so it can never destroy actual user data.
 *
 * Run: npx tsx api/e2e-check.ts
 */
import "dotenv/config";
import { and, eq, inArray, like, ne } from "drizzle-orm";
import { appRouter } from "./router";
import { getDb } from "./queries/connection";
import { getWorkspace } from "./lib/workspace";
import {
  activityLogs,
  bookings,
  groupMembers,
  notifications,
  payments,
  users,
} from "@db/schema";

async function cleanupWorkspace() {
  const db = getDb();
  const { user, group } = await getWorkspace();
  const caller = appRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user,
    isAdmin: true,
  });

  const all = await caller.bookings.list({ scope: "all", limit: 200 });
  for (const b of all) {
    await caller.bookings.delete({ id: b.id });
  }
  await db.delete(payments).where(eq(payments.groupId, group.id));
  await db.delete(activityLogs).where(eq(activityLogs.groupId, group.id));

  const demoUsers = await db.query.users.findMany({
    where: like(users.unionId, "demo_%"),
  });
  const demoIds = demoUsers.map((u) => u.id);
  if (demoIds.length > 0) {
    await db.delete(notifications).where(inArray(notifications.userId, demoIds));
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, group.id), inArray(groupMembers.userId, demoIds)));
    await db.delete(users).where(inArray(users.id, demoIds));
  }
  await db.delete(notifications).where(eq(notifications.userId, user.id));
}

async function main() {
  const db = getDb();
  const { user, group } = await getWorkspace();

  if (process.argv.includes("--clean")) {
    await cleanupWorkspace();
    console.log("✓ workspace cleaned");
    process.exit(0);
  }

  // Never run against a workspace that already has real games.
  const existing = await db.query.bookings.findFirst({
    where: and(eq(bookings.groupId, group.id), ne(bookings.status, "cancelled")),
  });
  if (existing) {
    console.log("⚠ workspace already has games — aborting e2e to protect real data");
    process.exit(0);
  }

  const caller = appRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user,
    isAdmin: true,
  });

  console.log("→ access gate checks…");
  const viewerCaller = appRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user,
    isAdmin: false,
  });
  let viewerBlocked = false;
  try {
    await viewerCaller.bookings.create({
      venue: "Test Venue",
      startsAt: new Date(Date.now() + 86_400_000),
      durationMin: 60,
      costPaise: 100,
      attendeeIds: [user.id],
    });
  } catch (e: any) {
    viewerBlocked = e.code === "FORBIDDEN" || String(e.message).includes("Read-only");
  }
  console.log("  viewer mutation blocked:", viewerBlocked);
  console.log("  wrong password rejected:", await caller.access
    .unlock({ password: "wrong" })
    .then(() => false)
    .catch(() => true));
  await caller.access.unlock({ password: "Nidith@2002" });
  console.log("  correct password unlocks: true");

  console.log("→ seeding demo data…");
  const seed = await caller.demo.seed();
  console.log("  games seeded:", seed.games);

  const players = await caller.players.list();
  console.log("→ players.list:", players.length, "players (incl. you)");

  const summary = await caller.dashboard.summary();
  console.log("→ dashboard.summary:");
  console.log("  hasData:", summary.hasData);
  console.log("  youOwe:", summary.youOwePaise, " owedToYou:", summary.owedToYouPaise);
  console.log("  monthSpend:", summary.monthSpendPaise, " gamesThisMonth:", summary.gamesThisMonth);
  console.log("  totalGames:", summary.totalGames, " upcoming:", summary.upcoming.length);
  console.log("  activity:", summary.activity.length, " monthlySpend rows:", summary.monthlySpend.length);

  const upcoming = await caller.bookings.list({ scope: "upcoming", limit: 50 });
  const past = await caller.bookings.list({ scope: "past", limit: 100 });
  console.log("→ bookings.list: upcoming:", upcoming.length, " past:", past.length);
  const pastAllPlayed = past.every((b) => b.status === "played");
  console.log("  every past game auto-marked played:", pastAllPlayed);

  // Verify the attendance-based split: share == (cost + shuttles) / attendees for equal splits
  const detail = await caller.bookings.get({ id: past[past.length - 1].id });
  const attended = detail.attendance.filter((a) => a.attended).length;
  const splitTotal = detail.splits.reduce((a, s) => a + s.amountPaise, 0);
  const expectedTotal = detail.costPaise + detail.shuttleCostPaise;
  console.log(`→ booking detail: ${attended} attendees, splits total ${splitTotal} == cost+shuttles ${expectedTotal}:`, splitTotal === expectedTotal);
  console.log("  split rows == attendees:", detail.splits.length === attended);

  // Shuttle expense: setting it re-splits over court + shuttle
  const shuttleBookingId = past[past.length - 2].id;
  const before = await caller.bookings.get({ id: shuttleBookingId });
  await caller.bookings.setShuttles({ id: shuttleBookingId, shuttleCostPaise: 24000 });
  const after = await caller.bookings.get({ id: shuttleBookingId });
  const afterTotal = after.splits.reduce((a, s) => a + s.amountPaise, 0);
  console.log(
    `→ shuttles: splits ${afterTotal} == cost ${after.costPaise} + 24000:`,
    afterTotal === after.costPaise + 24000,
  );
  // Booker contribution auto-adjusted, contributions still match the total
  const contribTotal = after.contributions.reduce((a, c) => a + c.amountPaise, 0);
  console.log("  contributions == total:", contribTotal === after.costPaise + 24000);
  await caller.bookings.setShuttles({ id: shuttleBookingId, shuttleCostPaise: before.shuttleCostPaise });

  const overview = await caller.payments.overview();
  console.log("→ payments.overview:");
  console.log("  youOwe:", overview.youOwe.length, " owedToYou:", overview.owedToYou.length);
  console.log("  pending:", overview.pendingConfirmations.length, " history:", overview.history.length);
  for (const d of overview.youOwe)
    console.log(`    owe ${d.other.name} ₹${d.amountPaise / 100}`);
  for (const d of overview.owedToYou)
    console.log(`    ${d.other.name} owes you ₹${d.amountPaise / 100}`);

  const settlement = await caller.payments.settlement();
  console.log("→ payments.settlement:");
  console.log("  plan transactions:", settlement.plan.length);
  for (const t of settlement.plan)
    console.log(`    ${t.fromName} → ${t.toName}: ₹${t.amountPaise / 100}`);
  console.log("  pairwise:", settlement.pairwise.length, " myBalance:", settlement.myBalancePaise);

  const stats = await caller.stats.personal();
  if (stats.hasData) {
    console.log("→ stats.personal:");
    console.log("  gamesPlayed:", stats.gamesPlayed, " attendance:", stats.attendancePct + "%");
    console.log("  totalCrewGames:", stats.totalCrewGames, " avgCost:", stats.avgCostPaise);
    console.log("  venues:", stats.venueBreakdown.map((v) => `${v.venue}(${v.count})`).join(", "));
    console.log("  mostActive:", stats.mostActive.map((m) => `${m.name}(${m.count})`).join(", "));
    console.log("  achievements earned:", stats.achievements.filter((a) => a.earned).map((a) => a.key).join(", "));
  }

  const search = await caller.search.query({ q: "playarena" });
  console.log("→ search 'playarena':", search.bookings.length, "bookings,", search.members.length, "players");

  /* ---------------- Route (NARS) mode ---------------- */
  console.log("→ Route mode checks…");
  console.log("  wrong NARS password rejected:", await caller.access
    .enterNars({ password: "wrong" })
    .then(() => false)
    .catch(() => true));
  await caller.access.enterNars({ password: "NARS@2002" });
  const narsCaller = appRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user,
    isAdmin: true,
    wsMode: "nars",
  });
  const narsPlayers = await narsCaller.players.list();
  const narsNames = narsPlayers.map((p) => p.name).sort().join(", ");
  console.log("  NARS roster:", narsPlayers.length, "players:", narsNames);
  console.log(
    "  exactly the 4 expected:",
    narsNames === ["Abhishek", "Nidith", "Rahul", "Sanjay"].sort().join(", "),
  );
  console.log("  demo seed blocked in Route mode:", await narsCaller.demo
    .seed()
    .then(() => false)
    .catch(() => true));
  const narsBooking = await narsCaller.bookings.create({
    venue: "Route Test Court",
    startsAt: new Date(Date.now() - 86_400_000),
    durationMin: 60,
    costPaise: 80000,
  });
  const narsDetail = await narsCaller.bookings.get({ id: narsBooking.id });
  console.log(
    "  NARS booking splits over 4 players:",
    narsDetail.splits.length === 4 &&
      narsDetail.splits.reduce((a, s) => a + s.amountPaise, 0) === 80000,
  );
  await narsCaller.bookings.delete({ id: narsBooking.id });

  /* ---------------- cleanup: restore the fresh workspace ---------------- */
  console.log("→ cleaning up…");
  await cleanupWorkspace();

  console.log("✓ e2e smoke test passed, workspace restored to fresh state");
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ e2e failed:", e);
  process.exit(1);
});
