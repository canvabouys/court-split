import { relations } from "drizzle-orm";
import {
  users,
  groups,
  groupMembers,
  bookings,
  attendance,
  contributions,
  splits,
  payments,
  notifications,
  activityLogs,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(groupMembers),
  notifications: many(notifications),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  owner: one(users, { fields: [groups.ownerId], references: [users.id] }),
  members: many(groupMembers),
  bookings: many(bookings),
  payments: many(payments),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  user: one(users, { fields: [groupMembers.userId], references: [users.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  group: one(groups, { fields: [bookings.groupId], references: [groups.id] }),
  bookedBy: one(users, { fields: [bookings.bookedById], references: [users.id] }),
  attendance: many(attendance),
  contributions: many(contributions),
  splits: many(splits),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  booking: one(bookings, { fields: [attendance.bookingId], references: [bookings.id] }),
  user: one(users, { fields: [attendance.userId], references: [users.id] }),
}));

export const contributionsRelations = relations(contributions, ({ one }) => ({
  booking: one(bookings, { fields: [contributions.bookingId], references: [bookings.id] }),
  user: one(users, { fields: [contributions.userId], references: [users.id] }),
}));

export const splitsRelations = relations(splits, ({ one }) => ({
  booking: one(bookings, { fields: [splits.bookingId], references: [bookings.id] }),
  user: one(users, { fields: [splits.userId], references: [users.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  group: one(groups, { fields: [payments.groupId], references: [groups.id] }),
  fromUser: one(users, { fields: [payments.fromUserId], references: [users.id] }),
  toUser: one(users, { fields: [payments.toUserId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  group: one(groups, { fields: [activityLogs.groupId], references: [groups.id] }),
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}));
