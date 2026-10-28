import { describe, expect, it } from "vitest";
import { foldMarks, markKey, mergeWeeks, parseDigest, weekStats } from "./digest";
import type { DigestFile, Mark } from "./types";

const file = (group: number, ch: string, ids: number[]): DigestFile => ({
  schema: 1,
  topic: "GameDev",
  group,
  year: 2026,
  week: 43,
  channels: [{ username: ch, title: ch, posts: ids.map((id) => ({ id, url: "u", title: "t", summary: "s" })) }],
});

describe("mergeWeeks", () => {
  it("склеивает группы одной недели", () => {
    const w = mergeWeeks([file(1, "a", [1]), file(2, "b", [2, 3])]);
    expect(w).toHaveLength(1);
    expect(w[0].channels.map((c) => c.username)).toEqual(["a", "b"]);
  });
  it("повторная загрузка канала заменяет прежнюю", () => {
    const w = mergeWeeks([file(1, "a", [1]), file(1, "a", [1, 2])]);
    expect(w[0].channels[0].posts).toHaveLength(2);
  });
  it("новые недели сверху", () => {
    const a = file(1, "a", [1]);
    const b = { ...file(1, "a", [1]), week: 44 };
    expect(mergeWeeks([a, b]).map((x) => x.week)).toEqual([44, 43]);
  });
});

describe("foldMarks", () => {
  const m = (ts: number, status: Mark["status"], device = "d1"): Mark => ({ key: "k", status, ts, device });
  it("побеждает больший ts, снятие отметки тоже запись", () => {
    expect(foldMarks([m(1, "read"), m(3, null), m(2, "idea")]).get("k")?.status).toBeNull();
  });
  it("при равном ts решает id устройства — одинаково везде", () => {
    const a = foldMarks([m(5, "read", "a"), m(5, "idea", "b")]).get("k")?.status;
    const b = foldMarks([m(5, "idea", "b"), m(5, "read", "a")]).get("k")?.status;
    expect(a).toBe(b);
  });
});

describe("weekStats", () => {
  it("считает новые и по статусам", () => {
    const [w] = mergeWeeks([file(1, "a", [1, 2, 3])]);
    const marks = foldMarks([{ key: markKey(w, "a", 1), status: "idea", ts: 1, device: "d" }]);
    const s = weekStats(w, marks);
    expect(s).toMatchObject({ total: 3, fresh: 2 });
    expect(s.byStatus.idea).toBe(1);
  });
});

describe("parseDigest", () => {
  it("отвергает чужой JSON", () => expect(typeof parseDigest("{}")).toBe("string"));
  it("приводит week-строку к числу", () => {
    const d = parseDigest(JSON.stringify({ ...file(1, "a", [1]), week: "43" }));
    expect(typeof d === "object" && d.week).toBe(43);
  });
  it("принимает дайджест", () => expect(typeof parseDigest(JSON.stringify(file(1, "a", [1])))).toBe("object"));
});
