import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { accessRouter } from "./routers/access";
import { bookingsRouter } from "./routers/bookings";
import { paymentsRouter } from "./routers/payments";
import { playersRouter } from "./routers/players";
import { activityRouter, dashboardRouter } from "./routers/dashboard";
import { searchRouter, statsRouter, usersRouter } from "./routers/stats";
import { demoRouter } from "./routers/demo";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  access: accessRouter,
  players: playersRouter,
  bookings: bookingsRouter,
  payments: paymentsRouter,
  dashboard: dashboardRouter,
  users: usersRouter,
  stats: statsRouter,
  search: searchRouter,
  activity: activityRouter,
  demo: demoRouter,
});

export type AppRouter = typeof appRouter;
