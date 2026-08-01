import {
  mysqlTable,
  mysqlEnum,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/* ------------------------------------------------------------------ */
/* Users                                                              */
/* ------------------------------------------------------------------ */

export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  upiId: varchar("upiId", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* ------------------------------------------------------------------ */
/* Groups                                                             */
/* ------------------------------------------------------------------ */

export const groups = mysqlTable(
  "groups",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    sport: varchar("sport", { length: 40 }).notNull().default("Badminton"),
    description: text("description"),
    emoji: varchar("emoji", { length: 16 }).notNull().default("🏸"),
    inviteCode: varchar("inviteCode", { length: 24 }).notNull().unique(),
    ownerId: bigint("ownerId", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("groups_owner_idx").on(t.ownerId)],
);

export type Group = typeof groups.$inferSelect;

export const groupMembers = mysqlTable(
  "group_members",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    groupId: bigint("groupId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    role: mysqlEnum("role", ["owner", "admin", "member"])
      .default("member")
      .notNull(),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("group_members_unique").on(t.groupId, t.userId),
    index("group_members_user_idx").on(t.userId),
  ],
);

export type GroupMember = typeof groupMembers.$inferSelect;

/* ------------------------------------------------------------------ */
/* Bookings                                                           */
/* ------------------------------------------------------------------ */

export const bookings = mysqlTable(
  "bookings",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    groupId: bigint("groupId", { mode: "number", unsigned: true }).notNull(),
    sport: varchar("sport", { length: 40 }).notNull(),
    venue: varchar("venue", { length: 160 }).notNull(),
    startsAt: timestamp("startsAt").notNull(),
    durationMin: int("durationMin").notNull().default(60),
    costPaise: int("costPaise").notNull(),
    /** Optional shuttlecock expense for this game — split among everyone present. */
    shuttleCostPaise: int("shuttleCostPaise").default(0).notNull(),
    bookedById: bigint("bookedById", { mode: "number", unsigned: true }).notNull(),
    notes: text("notes"),
    splitType: mysqlEnum("splitType", ["equal", "custom", "percentage", "weighted"])
      .default("equal")
      .notNull(),
    /** JSON: { customPaise?: Record<userId, paise>, weights?: Record<userId, number> } */
    splitConfig: text("splitConfig"),
    status: mysqlEnum("status", ["scheduled", "played", "cancelled"])
      .default("scheduled")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("bookings_group_idx").on(t.groupId),
    index("bookings_starts_idx").on(t.startsAt),
  ],
);

export type Booking = typeof bookings.$inferSelect;

export const attendance = mysqlTable(
  "attendance",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    bookingId: bigint("bookingId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    attended: boolean("attended").default(true).notNull(),
    /** Optional per-booking display name (e.g. a guest filling in) — admin editable. */
    nameOverride: varchar("nameOverride", { length: 255 }),
  },
  (t) => [
    uniqueIndex("attendance_unique").on(t.bookingId, t.userId),
    index("attendance_booking_idx").on(t.bookingId),
  ],
);

export type Attendance = typeof attendance.$inferSelect;

/* ------------------------------------------------------------------ */
/* Expenses                                                           */
/* ------------------------------------------------------------------ */

/** Money actually paid up-front for a booking (one or more payers). */
export const contributions = mysqlTable(
  "contributions",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    bookingId: bigint("bookingId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    amountPaise: int("amountPaise").notNull(),
  },
  (t) => [index("contributions_booking_idx").on(t.bookingId)],
);

export type Contribution = typeof contributions.$inferSelect;

/** Each attendee's computed share of a booking's cost. */
export const splits = mysqlTable(
  "splits",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    bookingId: bigint("bookingId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    amountPaise: int("amountPaise").notNull(),
    /** Admin marks whether this attendee has settled their share for the game. */
    settled: boolean("settled").default(false).notNull(),
  },
  (t) => [
    uniqueIndex("splits_unique").on(t.bookingId, t.userId),
    index("splits_booking_idx").on(t.bookingId),
  ],
);

export type Split = typeof splits.$inferSelect;

/* ------------------------------------------------------------------ */
/* Payments                                                           */
/* ------------------------------------------------------------------ */

export const payments = mysqlTable(
  "payments",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    groupId: bigint("groupId", { mode: "number", unsigned: true }).notNull(),
    fromUserId: bigint("fromUserId", { mode: "number", unsigned: true }).notNull(),
    toUserId: bigint("toUserId", { mode: "number", unsigned: true }).notNull(),
    amountPaise: int("amountPaise").notNull(),
    status: mysqlEnum("status", ["pending", "completed", "cancelled"])
      .default("pending")
      .notNull(),
    method: mysqlEnum("method", ["upi", "cash", "other"])
      .default("upi")
      .notNull(),
    note: varchar("note", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  (t) => [
    index("payments_group_idx").on(t.groupId),
    index("payments_from_idx").on(t.fromUserId),
    index("payments_to_idx").on(t.toUserId),
  ],
);

export type Payment = typeof payments.$inferSelect;

/* ------------------------------------------------------------------ */
/* Notifications & activity                                           */
/* ------------------------------------------------------------------ */

export const notifications = mysqlTable(
  "notifications",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    type: varchar("type", { length: 40 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: varchar("body", { length: 500 }),
    href: varchar("href", { length: 255 }),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export type Notification = typeof notifications.$inferSelect;

export const activityLogs = mysqlTable(
  "activity_logs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    groupId: bigint("groupId", { mode: "number", unsigned: true }),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    action: varchar("action", { length: 60 }).notNull(),
    detail: varchar("detail", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("activity_group_idx").on(t.groupId)],
);

export type ActivityLog = typeof activityLogs.$inferSelect;
