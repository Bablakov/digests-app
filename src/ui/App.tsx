import { computed, signal } from "@preact/signals";
import { markKey } from "../core/digest";
import { marks, ready, setStatus, syncDrive, syncing, toast, weeks } from "../core/store";
import { STATUS_LABEL, type Channel, type Post, type Status, type Week } from "../core/types";

type Tab = "week" | "new" | "marked";
type Open = { tab: Tab; w: Week; ch: Channel; p: Post };

const STATUSES: Status[] = ["idea", "later", "read", "rejected"];
const ICON: Record<Status, string> = { idea: "💡", later: "🕓", read: "✓", rejected: "✕" };
const TAB_LABEL: Record<Tab, string> = { week: "Неделя", new: "Новые", marked: "Отмеченные" };

const tab = signal<Tab>("week");
/** Выбранная неделя («год-номер»); пока не выбрана — берётся последняя. */
const period = signal<string | null>(null);
/** Выбранная тема; пусто — все темы. */
const topic = signal<string>("");
const weekFilter = signal<Status | "new" | "all">("all");
const markedFilter = signal<Status>("idea");
/** Открытый пост: список под ним остаётся на месте, поэтому «назад» возвращает туда же. */
const open = signal<Open | null>(null);

const periodOf = (w: Week): string => `${w.year}-${w.week}`;

interface Entry {
  w: Week;
  ch: Channel;
  p: Post;
  status: Status | null;
}

/** Все посты всех недель и тем, новые недели выше. */
const entries = computed<Entry[]>(() => {
  const out: Entry[] = [];
  for (const w of weeks.value) {
    for (const ch of w.channels) {
      for (const p of ch.posts) {
        out.push({ w, ch, p, status: marks.value.get(markKey(w, ch.username, p.id))?.status ?? null });
      }
    }
  }
  return out;
});

const periods = computed(() => {
  const seen = new Map<string, { year: number; week: number }>();
  for (const w of weeks.value) seen.set(periodOf(w), { year: w.year, week: w.week });
  return [...seen.entries()].map(([key, v]) => ({ key, ...v }));
});

const currentPeriod = computed(() => {
  const list = periods.value;
  return list.find((x) => x.key === period.value)?.key ?? list[0]?.key ?? "";
});

const topics = computed(() => [...new Set(weeks.value.map((w) => w.topic))].sort());

const visibleTopic = (e: Entry): boolean => !topic.value || e.w.topic === topic.value;

function openPost(e: Entry): void {
  open.value = { tab: tab.value, w: e.w, ch: e.ch, p: e.p };
}

function closePost(): void {
  open.value = null;
}

/** Ставит отметку и сразу возвращает к списку; пост, помеченный повторным нажатием, остаётся открытым. */
async function mark(o: Open, status: Status): Promise<void> {
  const before = marks.value.get(markKey(o.w, o.ch.username, o.p.id))?.status ?? null;
  await setStatus(o.w, o.ch.username, o.p.id, status);
  if (before !== status) closePost();
}

function TopicChips() {
  if (topics.value.length < 2) return null;
  return (
    <div class="filters">
      <button class={`chip ${topic.value === "" ? "on" : ""}`} onClick={() => (topic.value = "")}>
        Все темы
      </button>
      {topics.value.map((t) => (
        <button class={`chip ${topic.value === t ? "on" : ""}`} key={t} onClick={() => (topic.value = t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

function PostRow({ e }: { e: Entry }) {
  return (
    <button class={`post ${e.status ?? ""}`} onClick={() => openPost(e)}>
      <div class="row">
        <b>{e.p.title}</b>
        {e.status && <span>{ICON[e.status]}</span>}
      </div>
      <div class="muted">{e.p.summary}</div>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div class="empty">{text}</div>;
}

/** Список постов, сгруппированный: тема → канал. Для лент «Новые» и «Отмеченные» — с указанием недели. */
function Grouped({ list, withWeek }: { list: Entry[]; withWeek?: boolean }) {
  const groups = new Map<string, Entry[]>();
  for (const e of list) {
    const k = `${e.w.topic}|${e.ch.username}|${withWeek ? periodOf(e.w) : ""}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
  }
  return (
    <>
      {[...groups.entries()].map(([k, items]) => {
        const first = items[0];
        return (
          <section key={k}>
            <h2>
              {first.ch.title || first.ch.username}
              <span class="muted tag">
                {first.w.topic}
                {withWeek ? ` · нед. ${first.w.week}` : ""}
              </span>
            </h2>
            {items.map((e) => (
              <PostRow e={e} key={`${e.w.key}|${e.ch.username}|${e.p.id}`} />
            ))}
          </section>
        );
      })}
    </>
  );
}

function WeekTab() {
  if (!periods.value.length) return <Empty text="Пока пусто. Нажмите «Обновить», чтобы загрузить недели с Google Drive." />;
  const cur = currentPeriod.value;
  const inWeek = entries.value.filter((e) => periodOf(e.w) === cur && visibleTopic(e));
  const f = weekFilter.value;
  const list = inWeek.filter((e) => f === "all" || (f === "new" ? e.status === null : e.status === f));
  const done = inWeek.filter((e) => e.status !== null).length;
  return (
    <>
      <div class="filters">
        {periods.value.map((x) => (
          <button class={`chip ${cur === x.key ? "on" : ""}`} key={x.key} onClick={() => (period.value = x.key)}>
            Неделя {x.week}
          </button>
        ))}
      </div>
      <TopicChips />
      <div class="muted stat">
        Разобрано {done} из {inWeek.length}
      </div>
      <div class="filters">
        {(["all", "new", ...STATUSES] as const).map((k) => (
          <button class={`chip ${f === k ? "on" : ""}`} key={k} onClick={() => (weekFilter.value = k)}>
            {k === "all" ? "Все" : k === "new" ? "Новые" : `${ICON[k]} ${STATUS_LABEL[k]}`}
          </button>
        ))}
      </div>
      {list.length ? <Grouped list={list} /> : <Empty text="Здесь ничего нет" />}
    </>
  );
}

function NewTab() {
  const list = entries.value.filter((e) => e.status === null && visibleTopic(e));
  return (
    <>
      <TopicChips />
      <div class="muted stat">Неразобранных постов: {list.length}</div>
      {list.length ? <Grouped list={list} withWeek /> : <Empty text="Всё разобрано 🎉" />}
    </>
  );
}

function MarkedTab() {
  const f = markedFilter.value;
  const list = entries.value.filter((e) => e.status === f && visibleTopic(e));
  return (
    <>
      <div class="filters">
        {STATUSES.map((k) => (
          <button class={`chip ${f === k ? "on" : ""}`} key={k} onClick={() => (markedFilter.value = k)}>
            {ICON[k]} {STATUS_LABEL[k]} · {entries.value.filter((e) => e.status === k).length}
          </button>
        ))}
      </div>
      <TopicChips />
      {list.length ? <Grouped list={list} withWeek /> : <Empty text="Пока нет отмеченных постов" />}
    </>
  );
}

function PostScreen({ o }: { o: Open }) {
  const { ch, p } = o;
  const s = marks.value.get(markKey(o.w, ch.username, p.id))?.status ?? null;
  return (
    <div class="screen post-screen">
      <header class="bar">
        <button class="back" onClick={closePost}>
          ‹
        </button>
        <h1>{ch.title || ch.username}</h1>
      </header>
      <article>
        <h2>{p.title}</h2>
        <div class="muted">
          {o.w.topic}
          {p.date ? ` · ${new Date(p.date).toLocaleString("ru-RU")}` : ""}
        </div>
        <p class="muted summary">{p.summary}</p>
        {p.full_text ? <div class="full">{p.full_text}</div> : <p class="muted">Полного текста нет — откройте пост в Telegram.</p>}
        {!!p.image_count && <p class="muted">Изображений в посте: {p.image_count}</p>}
        <a class="btn" href={p.url} target="_blank" rel="noopener">
          Открыть в Telegram
        </a>
      </article>
      <footer class="actions">
        {STATUSES.map((st) => (
          <button class={`act ${s === st ? "on" : ""}`} key={st} onClick={() => mark(o, st)}>
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
  const o = open.value;
  return (
    <div class="app">
      {/* Список не размонтируется под открытым постом, чтобы сохранилась прокрутка. */}
      <div class="screen" hidden={!!o}>
        <header class="bar">
          <h1>{TAB_LABEL[tab.value]}</h1>
          <button class="btn" disabled={syncing.value} onClick={() => syncDrive(true)}>
            {syncing.value ? "Обновляю…" : "Обновить"}
          </button>
        </header>
        {tab.value === "week" && <WeekTab />}
        {tab.value === "new" && <NewTab />}
        {tab.value === "marked" && <MarkedTab />}
      </div>
      {o && <PostScreen o={o} />}
      {!o && (
        <nav class="tabs">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button class={tab.value === t ? "on" : ""} key={t} onClick={() => (tab.value = t)}>
              {TAB_LABEL[t]}
              {t === "new" && <b class="count">{entries.value.filter((e) => e.status === null).length}</b>}
            </button>
          ))}
        </nav>
      )}
      {toast.value && <div class="toast">{toast.value}</div>}
    </div>
  );
}
