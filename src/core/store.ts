import { computed, signal } from "@preact/signals";
import { allDigests, allMarks, appendMark, getMeta, saveDigest, setMeta } from "./db";
import { fetchNewDigests, getKey } from "./drive";
import { foldMarks, markKey, mergeWeeks, parseDigest } from "./digest";
import type { DigestFile, Mark, Status, Week } from "./types";

export const ready = signal(false);
export const toast = signal("");
const digests = signal<DigestFile[]>([]);
const journal = signal<Mark[]>([]);
let device = "";

export const weeks = computed<Week[]>(() => mergeWeeks(digests.value));
export const marks = computed(() => foldMarks(journal.value));

export function showToast(text: string): void {
  toast.value = text;
  setTimeout(() => {
    if (toast.value === text) toast.value = "";
  }, 2500);
}

export async function initStore(): Promise<void> {
  let id = await getMeta<string>("device");
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    await setMeta("device", id);
  }
  device = id;
  digests.value = await allDigests();
  journal.value = await allMarks();
  ready.value = true;
}

/** Принимает тексты JSON-файлов (из «Открыть файл» или с Drive) и сохраняет валидные. */
export async function importTexts(texts: string[]): Promise<number> {
  let ok = 0;
  const fresh = [...digests.value];
  for (const t of texts) {
    const d = parseDigest(t);
    if (typeof d === "string") {
      showToast(d);
      continue;
    }
    await saveDigest(d);
    const i = fresh.findIndex((x) => x.topic === d.topic && x.year === d.year && x.week === d.week && x.group === d.group);
    if (i < 0) fresh.push(d);
    else fresh[i] = d;
    ok++;
  }
  digests.value = fresh;
  return ok;
}

export const syncing = signal(false);

/** Подтягивает новые дайджесты с Drive. Без ключа тихо ничего не делает. */
export async function syncDrive(manual = false): Promise<void> {
  const key = await getKey();
  if (!key) {
    if (manual) showToast("Нет ключа Drive: откройте ссылку с #key=…");
    return;
  }
  if (syncing.value) return;
  syncing.value = true;
  try {
    const { texts, total } = await fetchNewDigests(key);
    const n = await importTexts(texts);
    if (manual || n) showToast(n ? `Новых файлов: ${n}` : `Всё актуально (файлов на Drive: ${total})`);
  } catch (e) {
    // Нет сети — не страшно: приложение работает с тем, что уже скачано.
    console.error("sync failed", e);
    if (manual) showToast(e instanceof Error ? e.message : "Не удалось обновить");
  } finally {
    syncing.value = false;
  }
}

/** Ставит отметку; повторное нажатие на ту же снимает её. */
export async function setStatus(w: Week, channel: string, postId: number, status: Status): Promise<void> {
  const key = markKey(w, channel, postId);
  const cur = marks.value.get(key)?.status ?? null;
  const m: Mark = { key, status: cur === status ? null : status, ts: Date.now(), device };
  await appendMark(m);
  journal.value = [...journal.value, m];
}
