import { openDB, type DBSchema } from "idb";
import type { DigestFile, Mark } from "./types";

interface Schema extends DBSchema {
  /** Загруженные дайджесты. Ключ — topic|year|week|group. */
  digests: { key: string; value: DigestFile };
  /** Журнал отметок: дописывается, ничего не стирается. */
  journal: { key: number; value: Mark; indexes: { key: string } };
  meta: { key: string; value: unknown };
}

const dbp = openDB<Schema>("digests", 1, {
  upgrade(db) {
    db.createObjectStore("digests");
    const j = db.createObjectStore("journal", { autoIncrement: true });
    j.createIndex("key", "key");
    db.createObjectStore("meta");
  },
});

export const digestId = (d: DigestFile): string => `${d.topic}|${d.year}|${d.week}|${d.group ?? ""}`;

export async function saveDigest(d: DigestFile): Promise<void> {
  await (await dbp).put("digests", d, digestId(d));
}
export async function allDigests(): Promise<DigestFile[]> {
  return (await dbp).getAll("digests");
}
export async function appendMark(m: Mark): Promise<void> {
  await (await dbp).add("journal", m);
}
export async function allMarks(): Promise<Mark[]> {
  return (await dbp).getAll("journal");
}
export async function getMeta<T>(k: string): Promise<T | undefined> {
  return (await (await dbp).get("meta", k)) as T | undefined;
}
export async function setMeta(k: string, v: unknown): Promise<void> {
  await (await dbp).put("meta", v, k);
}
