import { signal } from "@preact/signals";
import { postStatus, weekStats } from "../core/digest";
import { importTexts, marks, ready, setStatus, showToast, syncDrive, syncing, toast, weeks } from "../core/store";
import { STATUS_LABEL, type Channel, type Post, type Status, type Week } from "../core/types";

type Route = { name: "weeks" } | { name: "week"; key: string } | { name: "post"; key: string; channel: string; id: number };

const route = signal<Route>({ name: "weeks" });
const filter = signal<Status | "new" | "all">("all");

const STATUSES: Status[] = ["idea", "later", "read", "rejected"];
const ICON: Record<Status, string> = { idea: "💡", later: "🕓", read: "✓", rejected: "✕" };

const go = (r: Route): void => {
  route.value = r;
  window.scrollTo(0, 0);
};

async function openFiles(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (!files.length) return;
  const ok = await importTexts(await Promise.all(files.map((f) => f.text())));
  if (ok) showToast(`Загружено файлов: ${ok}`);
}

async function loadSample(): Promise<void> {
  const r = await fetch(`${import.meta.env.BASE_URL}sample/2026-W43_BioMachines_full.json`);
  await importTexts([await r.text()]);
}

function WeeksScreen() {
  const list = weeks.value;
  return (
    <div class="screen">
      <header class="bar">
        <h1>Дайджесты</h1>
        <button class="btn" disabled={syncing.value} onClick={() => syncDrive(true)}>
          {syncing.value ? "Обновляю…" : "Обновить"}
        </button>
        <label class="btn">
          Файл
          <input type="file" accept=".json,application/json" multiple hidden onChange={openFiles} />
        </label>
      </header>
      {list.length === 0 && (
        <div class="empty">
          <p>Пока пусто. Нажмите «Обновить», чтобы загрузить недели с Google Drive.</p>
          <button class="btn" onClick={loadSample}>
            Загрузить пример
          </button>
        </div>
      )}
      {list.map((w) => {
        const s = weekStats(w, marks.value);
        return (
          <button class="card" key={w.key} onClick={() => go({ name: "week", key: w.key })}>
            <div class="row">
              <b>{w.topic}</b>
              <span class="muted">
                {w.year}, неделя {w.week}
              </span>
            </div>
            <div class="muted">
              Постов: {s.total} · новых: {s.fresh}
            </div>
            <div class="chips">
              {STATUSES.filter((st) => s.byStatus[st] > 0).map((st) => (
                <span class="chip" key={st}>
                  {ICON[st]} {s.byStatus[st]}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function WeekScreen({ w }: { w: Week }) {
  const f = filter.value;
  const visible = (ch: Channel, p: Post): boolean => {
    const s = postStatus(w, ch, p, marks.value);
    return f === "all" || (f === "new" ? s === null : s === f);
  };
  return (
    <div class="screen">
      <header class="bar">
        <button class="back" onClick={() => go({ name: "weeks" })}>
          ‹
        </button>
        <h1>
          {w.topic} · {w.week}
        </h1>
      </header>
      <div class="filters">
        {(["all", "new", ...STATUSES] as const).map((k) => (
          <button class={`chip ${f === k ? "on" : ""}`} key={k} onClick={() => (filter.value = k)}>
            {k === "all" ? "Все" : k === "new" ? "Новые" : `${ICON[k]} ${STATUS_LABEL[k]}`}
          </button>
        ))}
      </div>
      {w.channels.map((ch) => {
        const posts = ch.posts.filter((p) => visible(ch, p));
        if (!posts.length) return null;
        return (
          <section key={ch.username}>
            <h2>{ch.title || ch.username}</h2>
            {ch.week_summary && <p class="muted summary">{ch.week_summary}</p>}
            {posts.map((p) => {
              const s = postStatus(w, ch, p, marks.value);
              return (
                <button class={`post ${s ?? ""}`} key={p.id} onClick={() => go({ name: "post", key: w.key, channel: ch.username, id: p.id })}>
                  <div class="row">
                    <b>{p.title}</b>
                    {s && <span>{ICON[s]}</span>}
                  </div>
                  <div class="muted">{p.summary}</div>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function PostScreen({ w, ch, p }: { w: Week; ch: Channel; p: Post }) {
  const s = postStatus(w, ch, p, marks.value);
  return (
    <div class="screen">
      <header class="bar">
        <button class="back" onClick={() => go({ name: "week", key: w.key })}>
          ‹
        </button>
        <h1>{ch.title || ch.username}</h1>
      </header>
      <article>
        <h2>{p.title}</h2>
        {p.date && <div class="muted">{new Date(p.date).toLocaleString("ru-RU")}</div>}
        <p class="muted summary">{p.summary}</p>
        {p.full_text ? <div class="full">{p.full_text}</div> : <p class="muted">Полного текста нет — откройте пост в Telegram.</p>}
        {!!p.image_count && <p class="muted">Изображений в посте: {p.image_count}</p>}
        <a class="btn" href={p.url} target="_blank" rel="noopener">
          Открыть в Telegram
        </a>
      </article>
      <footer class="actions">
        {STATUSES.map((st) => (
          <button class={`act ${s === st ? "on" : ""}`} key={st} onClick={() => setStatus(w, ch.username, p.id, st)}>
            <span>{ICON[st]}</span>
            {STATUS_LABEL[st]}
          </button>
        ))}
      </footer>
    </div>
  );
}

export function App() {
  if (!ready.value) return <div class="empty">Загрузка…</div>;
  const r = route.value;
  const w = r.name === "weeks" ? undefined : weeks.value.find((x) => x.key === r.key);
  let body;
  if (r.name === "weeks" || !w) body = <WeeksScreen />;
  else if (r.name === "week") body = <WeekScreen w={w} />;
  else {
    const ch = w.channels.find((c) => c.username === r.channel);
    const p = ch?.posts.find((x) => x.id === r.id);
    body = ch && p ? <PostScreen w={w} ch={ch} p={p} /> : <WeekScreen w={w} />;
  }
  return (
    <div class="app">
      {body}
      {toast.value && <div class="toast">{toast.value}</div>}
    </div>
  );
}
