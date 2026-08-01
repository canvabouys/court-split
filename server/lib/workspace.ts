import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { groupMembers, groups, users, type Group, type User } from "@db/schema";
import { MAX_PLAYERS_PER_GAME, MAX_ROSTER_SIZE } from "@contracts/constants";
import { getDb } from "../queries/connection";
import type { WorkspaceMode } from "./access";

/**
 * CourtSplit runs as local workspaces — no login, no group picker.
 * There is exactly one owner (the admin) and two possible workspaces:
 *  - "crew": the full badminton crew (8 players)
 *  - "nars": the private 4-player "Route" squad (Nidith, Abhishek, Rahul, Sanjay)
 */

export const LOCAL_UNION_ID = "local_owner";
export const OWNER_NAME = "Nidith";

/** Default crew — the owner plus these 7 players (8 total, the on-court max). */
export const DEFAULT_PLAYER_NAMES = [
  "Abhishek",
  "Sanjay",
  "Rahul",
  "Hari Prasad",
  "Bhuvan",
  "Kushal",
  "Yashwanth",
] as const;

/** The Route mode roster — exactly these 3 plus the owner. Never grows. */
export const NARS_PLAYER_NAMES = ["Abhishek", "Rahul", "Sanjay"] as const;

const CREW_GROUP_NAME = "Badminton Crew";
const NARS_GROUP_NAME = "NARS Squad";

export { MAX_PLAYERS_PER_GAME, MAX_ROSTER_SIZE };

export async function getLocalUser(): Promise<User> {
  const db = getDb();
  const existing = await db.query.users.findFirst({
    where: eq(users.unionId, LOCAL_UNION_ID),
  });
  if (existing) return existing;
  await db
    .insert(users)
    .values({ unionId: LOCAL_UNION_ID, name: OWNER_NAME, role: "admin" })
    .onDuplicateKeyUpdate({ set: { name: OWNER_NAME } });
  const created = await db.query.users.findFirst({
    where: eq(users.unionId, LOCAL_UNION_ID),
  });
  return created!;
}

export interface Workspace {
  user: User;
  group: Group;
}

/** Create (or reuse by name) a player user and add them to the group. */
async function addPlayerByName(groupId: number, name: string) {
  const db = getDb();
  const existing = await db.query.users.findFirst({ where: eq(users.name, name) });
  let userId: number;
  if (existing) {
    userId = existing.id;
  } else {
    const [{ id }] = await db
      .insert(users)
      .values({ unionId: `player_${nanoid(10)}`, name, role: "user" })
      .$returningId();
    userId = id;
  }
  await db
    .insert(groupMembers)
    .values({ groupId, userId, role: "member" })
    .onDuplicateKeyUpdate({ set: { role: "member" } });
}

async function addDefaultPlayers(groupId: number) {
  for (const name of DEFAULT_PLAYER_NAMES) {
    await addPlayerByName(groupId, name);
  }
}

async function findOwnedGroup(ownerId: number, name: string): Promise<Group | null> {
  const db = getDb();
  const found = await db.query.groups.findFirst({
    where: and(eq(groups.ownerId, ownerId), eq(groups.name, name)),
  });
  return found ?? null;
}

async function createGroup(ownerId: number, name: string, description: string): Promise<Group> {
  const db = getDb();
  const [{ id }] = await db
    .insert(groups)
    .values({
      name,
      sport: "Badminton",
      emoji: "🏸",
      description,
      inviteCode: nanoid(10),
      ownerId,
    })
    .$returningId();
  await db.insert(groupMembers).values({ groupId: id, userId: ownerId, role: "owner" });
  return (await db.query.groups.findFirst({ where: eq(groups.id, id) }))!;
}

async function getCrewWorkspace(user: User): Promise<Workspace> {
  const db = getDb();
  let group = await findOwnedGroup(user.id, CREW_GROUP_NAME);
  if (!group) {
    group = await createGroup(user.id, CREW_GROUP_NAME, "Games, splits and settlements for your crew.");
  }
  // Fresh workspace (owner only) → provision the default roster once.
  const count = await db.$count(groupMembers, eq(groupMembers.groupId, group.id));
  if (count === 1) await addDefaultPlayers(group.id);
  return { user, group };
}

async function getNarsWorkspace(user: User): Promise<Workspace> {
  const db = getDb();
  let group = await findOwnedGroup(user.id, NARS_GROUP_NAME);
  if (!group) {
    group = await createGroup(user.id, NARS_GROUP_NAME, "Private 4-player split squad.");
  }
  const members = await db.query.groupMembers.findMany({
    where: eq(groupMembers.groupId, group.id),
  });
  // Provision the fixed 4-player roster once; it never accepts new players.
  if (members.length === 1) {
    for (const name of NARS_PLAYER_NAMES) {
      await addPlayerByName(group.id, name);
    }
  }
  return { user, group };
}

export async function getWorkspace(mode: WorkspaceMode = "crew"): Promise<Workspace> {
  const user = await getLocalUser();
  return mode === "nars" ? getNarsWorkspace(user) : getCrewWorkspace(user);
}
