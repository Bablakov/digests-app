import { getMeta, setMeta } from "./db";

/** Корневая папка рутин: Data Processing / Claude. Открыта по ссылке только на чтение. */
export const ROOT_FOLDER = "1yp2-vWFInJVw5XniCT7F9e88hgQXdqIP";

const API = "https://www.googleapis.com/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const FULL_JSON = /_full\.json$/;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

export const getKey = (): Promise<string | undefined> => getMeta<string>("driveKey");
export const setKey = (k: string): Promise<void> => setMeta("driveKey", k);

async function list(folder: string, key: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let token = "";
  do {
    const q = encodeURIComponent(`'${folder}' in parents and trashed = false`);
    const url = `${API}?q=${q}&pageSize=200&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&key=${key}${token ? `&pageToken=${token}` : ""}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const j = (await r.json()) as { files: DriveFile[]; nextPageToken?: string };
    out.push(...j.files);
    token = j.nextPageToken ?? "";
  } while (token);
  return out;
}

/** Обходит дерево папок и собирает все файлы *_full.json. */
async function findDigests(folder: string, key: string, depth = 0): Promise<DriveFile[]> {
  const items = await list(folder, key);
  const found = items.filter((f) => f.mimeType !== FOLDER && FULL_JSON.test(f.name));
  if (depth >= 4) return found;
  const sub = await Promise.all(items.filter((f) => f.mimeType === FOLDER).map((f) => findDigests(f.id, key, depth + 1)));
  return found.concat(...sub);
}

/**
 * Скачивает с Drive новые и изменённые дайджесты. Уже загруженные (тот же id и время изменения) пропускаются.
 * Возвращает тексты JSON для importTexts.
 */
export async function fetchNewDigests(key: string): Promise<{ texts: string[]; total: number }> {
  const files = await findDigests(ROOT_FOLDER, key);
  const seen = (await getMeta<Record<string, string>>("driveSeen")) ?? {};
  const todo = files.filter((f) => seen[f.id] !== f.modifiedTime);
  const texts: string[] = [];
  for (const f of todo) {
    const r = await fetch(`${API}/${f.id}?alt=media&key=${key}`);
    if (!r.ok) throw new Error(`Drive ${r.status} при загрузке ${f.name}`);
    texts.push(await r.text());
    seen[f.id] = f.modifiedTime;
  }
  await setMeta("driveSeen", seen);
  return { texts, total: files.length };
}
