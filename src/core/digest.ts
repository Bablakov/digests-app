import type { Channel, DigestFile, Mark, Post, Status, Week } from "./types";

export const weekKey = (topic: string, year: number, week: number): string => `${topic}|${year}|${week}`;

export const markKey = (w: { topic: string; year: number; week: number }, channel: string, postId: number): string =>
  `${weekKey(w.topic, w.year, w.week)}|${channel}|${postId}`;

/** Проверяет, что JSON похож на дайджест; возвращает его или текст ошибки. */
export function parseDigest(text: string): DigestFile | string {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return "Файл не похож на JSON";
  }
  const d = j as Partial<DigestFile>;
  // Рутины иногда пишут week строкой ("43") — приводим к числу.
  const year = Number(d?.year);
  const week = Number(d?.week);
  if (!d || typeof d.topic !== "string" || !Number.isInteger(year) || !Number.isInteger(week) || !Array.isArray(d.channels)) {
    return "Это не дайджест: нет topic / year / week / channels";
  }
  return { ...d, year, week } as DigestFile;
}

/** Склеивает файлы одной недели (например, 4 группы GameDev) в одну неделю по теме. */
export function mergeWeeks(files: DigestFile[]): Week[] {
  const map = new Map<string, Week>();
  for (const f of files) {
    const key = weekKey(f.topic, f.year, f.week);
    let w = map.get(key);
    if (!w) {
      w = { key, topic: f.topic, year: f.year, week: f.week, channels: [] };
      map.set(key, w);
    }
    for (const ch of f.channels) {
      const i = w.channels.findIndex((c) => c.username === ch.username);
      if (i < 0) w.channels.push(ch);
      else w.channels[i] = ch; // повторная загрузка того же канала заменяет старую
    }
  }
  return [...map.values()].sort((a, b) => b.year - a.year || b.week - a.week || a.topic.localeCompare(b.topic));
}

/** Итоговое состояние отметок из журнала: для каждого ключа побеждает запись с большим ts. */
export function foldMarks(journal: Mark[]): Map<string, Mark> {
  const out = new Map<string, Mark>();
  for (const m of journal) {
    const cur = out.get(m.key);
    if (!cur || m.ts > cur.ts || (m.ts === cur.ts && m.device > cur.device)) out.set(m.key, m);
  }
  return out;
}

export interface WeekStats {
  total: number;
  fresh: number;
  byStatus: Record<Status, number>;
}

export function weekStats(w: Week, marks: Map<string, Mark>): WeekStats {
  const byStatus: Record<Status, number> = { read: 0, rejected: 0, idea: 0, later: 0 };
  let total = 0;
  let fresh = 0;
  for (const ch of w.channels) {
    for (const p of ch.posts) {
      total++;
      const s = marks.get(markKey(w, ch.username, p.id))?.status;
      if (s) byStatus[s]++;
      else fresh++;
    }
  }
  return { total, fresh, byStatus };
}

export const postStatus = (w: Week, ch: Channel, p: Post, marks: Map<string, Mark>): Status | null =>
  marks.get(markKey(w, ch.username, p.id))?.status ?? null;
