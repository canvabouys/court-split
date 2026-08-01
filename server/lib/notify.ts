import { activityLogs, notifications } from "@db/schema";
import { getDb } from "../queries/connection";

export async function notify(
  userIds: number | number[],
  n: { type: string; title: string; body?: string; href?: string },
) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 0) return;
  await getDb()
    .insert(notifications)
    .values(
      ids.map((userId) => ({
        userId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        href: n.href ?? null,
      })),
    );
}

export async function logActivity(
  userId: number,
  action: string,
  detail?: string,
  groupId?: number | null,
) {
  await getDb()
    .insert(activityLogs)
    .values({ userId, action, detail: detail ?? null, groupId: groupId ?? null });
}
