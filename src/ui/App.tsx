import { computed, signal } from "@preact/signals";
import { useRef } from "preact/hooks";
import { getKey, setKey } from "../core/drive";
import { markKey } from "../core/digest";
import { weekRange } from "../core/isoweek";
import { sanitizeHtml } from "../core/sanitize";
import { hiddenTopics, statusMode, swipeEnabled, textSize, type StatusMode, type TextSize } from "../core/settings";
import { marks, ready, setArchived, setStatus, showToast, syncDrive, syncing, toast, weeks } from "../core/store";
import { STATUS_LABEL, type Channel, type Post, type Status, type Week } from "../core/types";

type Tab = "week" | "new" | "marked" | "settings";
type Sheet = "" | "week" | "filter";
type Open = { w: Week; ch: Channel; p: Post };

/** «Посмотреть потом» пока скрыт: хватает вкладок «Неделя» и «Новые». Тип и старые отметки остаются в данных. */
const STATUSES: Status[] = ["idea", "read", "rejected"];
const ICON: Record<Status, string> = { idea: "💡", later: "🕓", read: "✓", rejected: "✕" };
const TAB_LABEL: Record<Tab, string> = { week: "Неделя", new: "Новые", marked: "Отмеченные", settings: "Настройки" };
const TAB_ICON: Record<Tab, string> = { week: "📅", new: "✨", marked: "⭐", settings: "⚙️" };
/** Темы показываются в фильтре всегда, даже пока по ним нет данных. */
const KNOWN_TOPICS = ["BioMachines", "AI", "Investment", "GameDev"];

const tab = signal<Tab>("week");
const sheet = signal<Sheet>("");
/** Выбранная неделя; пока не выбрана — берётся последняя. */
const period = signal<{ year: number; week: number } | null>(null);
const markedFilter = signal<Status>("idea");
/** Во вкладке «Отмеченные»: что ещё в работе, а что уже в архиве. */
const archiveView = signal<"work" | "archive">("work");
const canArchive = (s: Status | null): boolean => s === "idea";
/** Открытый пост: список под ним не размонтируется, поэтому «назад» возвращает туда же. */
const open = signal<Open | null>(null);

interface Entry {
  w: Week;
  ch: Channel;
  p: Post;
  status: Status | null;
  /** Идея / «позже» отработаны (лежат в архиве). */
  archived: boolean;
}

/** Все посты всех недель и тем с их статусом. */
const entries = computed<Entry[]>(() => {
  const out: Entry[] = [];
  for (const w of weeks.value)
    for (const ch of w.channels)
      for (const p of ch.posts) {
        const m = marks.value.get(markKey(w, ch.username, p.id));
        out.push({ w, ch, p, status: m?.status ?? null, archived: !!m?.archived });
      }
  return out;
});

const topics = computed(() => [...new Set([...KNOWN_TOPICS, ...weeks.value.map((w) => w.topic)])]);

/** Недели, по которым есть данные, новые первыми. */
const periods = computed(() => {
  const seen = new Map<string, { year: number; week: number }>();
  for (const w of weeks.value) seen.set(`${w.year}-${w.week}`, { year: w.year, week: w.week });
  return [...seen.values()].sort((a, b) => b.year - a.year || b.week - a.week);
});

const currentPeriod = computed(() => {
  const p = period.value;
  const list = periods.value;
  return list.find((x) => p && x.year === p.year && x.week === p.week) ?? list[0] ?? null;
});

const topicVisible = (e: Entry): boolean => !hiddenTopics.value.includes(e.w.topic);
const filtersActive = computed(() => hiddenTopics.value.length > 0 || statusMode.value !== "all");

function openPost(e: Entry): void {
  open.value = { w: e.w, ch: e.ch, p: e.p };
}
const closePost = (): void => {
  open.value = null;
};

/** Ставит отметку и сразу возвращает к списку; повторное нажатие на ту же снимает её, пост остаётся открытым. */
async function mark(o: Open, status: Status): Promise<void> {
  const before = marks.value.get(markKey(o.w, o.ch.username, o.p.id))?.status ?? null;
  await setStatus(o.w, o.ch.username, o.p.id, status);
  if (before !== status) closePost();
}

function Empty({ text }: { text: string }) {
  return <div class="empty">{text}</div>;
}

/** Строка поста. Свайп влево — «отверг», вправо — «хорошая идея». */
function PostRow({ e, inMarked }: { e: Entry; inMarked?: boolean }) {
  /** В «Отмеченных» свайп вправо отправляет идею в архив (или возвращает), в остальных списках — ставит «идея». */
  const archiveSwipe = !!inMarked && canArchive(e.status);
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, y: 0, dx: 0, active: false, locked: false });

  const setX = (dx: number): void => {
    if (el.current) el.current.style.transform = dx ? `translateX(${dx}px)` : "";
  };
  const onDown = (ev: PointerEvent): void => {
    if (!swipeEnabled.value) return;
    drag.current = { x: ev.clientX, y: ev.clientY, dx: 0, active: true, locked: false };
  };
  const onMove = (ev: PointerEvent): void => {
    const d = drag.current;
    if (!d.active) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    // Вертикальное движение — это прокрутка, свайп не начинаем.
    if (!d.locked && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
      d.active = false;
      setX(0);
      return;
    }
    if (Math.abs(dx) > 10) d.locked = true;
    if (d.locked) {
      d.dx = dx;
      setX(Math.max(-140, Math.min(140, dx)));
    }
  };
  const onUp = (): void => {
    const d = drag.current;
    drag.current.active = false;
    setX(0);
    if (!d.locked) return;
    if (d.dx < -90 && e.status !== "rejected") void setStatus(e.w, e.ch.username, e.p.id, "rejected");
    else if (d.dx > 90) {
      if (archiveSwipe) void setArchived(e.w, e.ch.username, e.p.id, !e.archived);
      else if (e.status !== "idea") void setStatus(e.w, e.ch.username, e.p.id, "idea");
    }
  };

  return (
    <div class="swipe">
      <div class="swipe-bg left">{archiveSwipe ? (e.archived ? "↩ В работу" : "📦 В архив") : "💡 Идея"}</div>
      <div class="swipe-bg right">Отверг ✕</div>
      <div
        ref={el}
        class={`post ${e.status ?? ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => {
          if (!drag.current.locked) openPost(e);
        }}
      >
        <div class="row">
          <b>{e.p.title || "(без заголовка)"}</b>
          {e.status && <span>{ICON[e.status]}</span>}
        </div>
        <div class="muted">{e.p.summary}</div>
      </div>
    </div>
  );
}

/** Список постов, сгруппированный: тема → канал. */
function Grouped({ list, withWeek, inMarked }: { list: Entry[]; withWeek?: boolean; inMarked?: boolean }) {
  const groups = new Map<string, Entry[]>();
  for (const e of list) {
    const k = `${e.w.topic}|${e.ch.username}|${withWeek ? `${e.w.year}-${e.w.week}` : ""}`;
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
              <PostRow e={e} inMarked={inMarked} key={`${e.w.key}|${e.ch.username}|${e.p.id}`} />
            ))}
          </section>
        );
      })}
    </>
  );
}

function WeekTab() {
  const cur = currentPeriod.value;
  if (!cur) return <Empty text="Пока пусто. Нажмите ⟳, чтобы загрузить недели с Google Drive." />;
  const mode = statusMode.value;
  // Отвергнутые из недели исчезают; найти их можно в «Отмеченные → Отверг».
  const list = entries.value.filter(
    (e) =>
      e.status !== "rejected" &&
      e.w.year === cur.year &&
      e.w.week === cur.week &&
      topicVisible(e) &&
      (mode === "all" || (mode === "new" ? e.status === null : e.status !== null)),
  );
  const all = entries.value.filter((e) => e.w.year === cur.year && e.w.week === cur.week && topicVisible(e));
  const idx = periods.value.findIndex((x) => x.year === cur.year && x.week === cur.week);
  const step = (d: number): void => {
    const n = periods.value[idx + d];
    if (n) period.value = n;
  };
  return (
    <>
      <div class="weekbar">
        <button class="arrow" disabled={idx >= periods.value.length - 1} onClick={() => step(1)}>
          ‹
        </button>
        <button class="weekbtn" onClick={() => (sheet.value = "week")}>
          <b>Неделя {cur.week}, {cur.year}</b>
          <span class="muted">{weekRange(cur.year, cur.week)} ▾</span>
        </button>
        <button class="arrow" disabled={idx <= 0} onClick={() => step(-1)}>
          ›
        </button>
      </div>
      <div class="muted stat">
        Разобрано {all.filter((e) => e.status !== null).length} из {all.length}
      </div>
      {list.length ? <Grouped list={list} /> : <Empty text="Здесь ничего нет" />}
    </>
  );
}

function NewTab() {
  const list = entries.value.filter((e) => e.status === null && topicVisible(e));
  return (
    <>
      <div class="muted stat">Неразобранных постов: {list.length}</div>
      {list.length ? <Grouped list={list} withWeek /> : <Empty text="Всё разобрано 🎉" />}
    </>
  );
}

function MarkedTab() {
  const f = markedFilter.value;
  const split = canArchive(f);
  const view = archiveView.value;
  const inStatus = entries.value.filter((e) => e.status === f && topicVisible(e));
  const list = split ? inStatus.filter((e) => e.archived === (view === "archive")) : inStatus;
  return (
    <>
      <div class="filters">
        {STATUSES.map((k) => (
          <button class={`chip ${f === k ? "on" : ""}`} key={k} onClick={() => (markedFilter.value = k)}>
            {ICON[k]} {STATUS_LABEL[k]} · {entries.value.filter((e) => e.status === k && topicVisible(e) && !(canArchive(k) && e.archived)).length}
          </button>
        ))}
      </div>
      {split && (
        <div class="seg">
          <button class={view === "work" ? "on" : ""} onClick={() => (archiveView.value = "work")}>
            В работе · {inStatus.filter((e) => !e.archived).length}
          </button>
          <button class={view === "archive" ? "on" : ""} onClick={() => (archiveView.value = "archive")}>
            Архив · {inStatus.filter((e) => e.archived).length}
          </button>
        </div>
      )}
      {list.length ? <Grouped list={list} withWeek inMarked /> : <Empty text={split && view === "archive" ? "Архив пуст" : "Пока нет отмеченных постов"} />}
    </>
  );
}

function SettingsTab() {
  const keyState = useRef<HTMLSpanElement>(null);
  void getKey().then((k) => {
    if (keyState.current) keyState.current.textContent = k ? "подключён" : "не задан";
  });
  const sizes: [TextSize, string][] = [
    ["s", "Мелкий"],
    ["m", "Обычный"],
    ["l", "Крупный"],
  ];
  return (
    <div class="settings">
      <h2>Чтение</h2>
      <div class="set-row">
        <span>Размер текста</span>
        <div class="seg">
          {sizes.map(([k, label]) => (
            <button class={textSize.value === k ? "on" : ""} key={k} onClick={() => (textSize.value = k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <label class="set-row">
        <span>
          Свайпы в списке
          <small class="muted">вправо — идея, влево — отверг</small>
        </span>
        <input type="checkbox" checked={swipeEnabled.value} onChange={(e) => (swipeEnabled.value = e.currentTarget.checked)} />
      </label>

      <h2>Google Drive</h2>
      <div class="set-row">
        <span>
          Доступ к папке
          <small class="muted" ref={keyState}>
            …
          </small>
        </span>
        <button class="btn" disabled={syncing.value} onClick={() => syncDrive(true)}>
          {syncing.value ? "Обновляю…" : "Обновить"}
        </button>
      </div>
      <div class="set-row">
        <span>Забыть ключ на этом устройстве</span>
        <button
          class="btn ghost"
          onClick={async () => {
            await setKey("");
            showToast("Ключ удалён");
          }}
        >
          Забыть
        </button>
      </div>

      <h2>О приложении</h2>
      <p class="muted">Дайджест · версия {__APP_VERSION__}</p>
    </div>
  );
}

/** Нижний лист: выбор недели «год + неделя» (на iPhone — барабан) или фильтр. */
function Sheets() {
  if (!sheet.value) return null;
  const close = (): void => {
    sheet.value = "";
  };
  const cur = currentPeriod.value;
  const years = [...new Set(periods.value.map((p) => p.year))];
  const weeksOfYear = (y: number) => periods.value.filter((p) => p.year === y);
  return (
    <div class="overlay" onClick={close}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        {sheet.value === "week" && cur && (
          <>
            <h3>Выбор недели</h3>
            <div class="pickers">
              <label>
                Год
                <select
                  value={cur.year}
                  onChange={(e) => {
                    const y = Number(e.currentTarget.value);
                    period.value = weeksOfYear(y)[0] ?? null;
                  }}
                >
                  {years.map((y) => (
                    <option value={y} key={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Неделя
                <select
                  value={cur.week}
                  onChange={(e) => (period.value = { year: cur.year, week: Number(e.currentTarget.value) })}
                >
                  {weeksOfYear(cur.year).map((p) => (
                    <option value={p.week} key={p.week}>
                      {p.week} · {weekRange(p.year, p.week)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button class="btn wide" onClick={close}>
              Готово
            </button>
          </>
        )}
        {sheet.value === "filter" && (
          <>
            <h3>Фильтр</h3>
            <h4>Темы</h4>
            <div class="checks">
              {topics.value.map((t) => (
                <label key={t}>
                  <input
                    type="checkbox"
                    checked={!hiddenTopics.value.includes(t)}
                    onChange={(e) =>
                      (hiddenTopics.value = e.currentTarget.checked ? hiddenTopics.value.filter((x) => x !== t) : [...hiddenTopics.value, t])
                    }
                  />
                  {t}
                </label>
              ))}
            </div>
            {tab.value === "week" && (
              <>
                <h4>Разбор</h4>
                <div class="seg">
                  {(
                    [
                      ["all", "Все"],
                      ["new", "Неразобранные"],
                      ["done", "Разобранные"],
                    ] as [StatusMode, string][]
                  ).map(([k, label]) => (
                    <button class={statusMode.value === k ? "on" : ""} key={k} onClick={() => (statusMode.value = k)}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div class="sheet-actions">
              <button
                class="btn ghost"
                onClick={() => {
                  hiddenTopics.value = [];
                  statusMode.value = "all";
                }}
              >
                Сбросить
              </button>
              <button class="btn" onClick={close}>
                Готово
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PostScreen({ o }: { o: Open }) {
  const { ch, p } = o;
  const m = marks.value.get(markKey(o.w, ch.username, p.id));
  const s = m?.status ?? null;
  const archived = !!m?.archived;
  return (
    <div class={`screen post-screen size-${textSize.value}`}>
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
        {p.full_html ? (
          <div class="full html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.full_html) }} />
        ) : p.full_text ? (
          <div class="full">{p.full_text}</div>
        ) : (
          <>
            <p class="muted summary">{p.summary}</p>
            <p class="muted">Полного текста нет — откройте пост в Telegram.</p>
          </>
        )}
        {!!p.image_count && <p class="muted">Изображений в посте: {p.image_count}</p>}
        <a class="btn" href={p.url} target="_blank" rel="noopener">
          Открыть в Telegram
        </a>
        {canArchive(s) && (
          <button
            class="btn ghost archive-btn"
            onClick={async () => {
              await setArchived(o.w, ch.username, p.id, !archived);
              closePost();
            }}
          >
            {archived ? "↩ Вернуть в работу" : "📦 В архив — обработано"}
          </button>
        )}
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
  const t = tab.value;
  return (
    <div class="app">
      {/* Список не размонтируется под открытым постом, чтобы сохранилась прокрутка. */}
      <div class="screen" hidden={!!o}>
        <header class="bar">
          <h1>{TAB_LABEL[t]}</h1>
          {t !== "settings" && (
            <button class={`icon-btn ${filtersActive.value ? "on" : ""}`} aria-label="Фильтр" onClick={() => (sheet.value = "filter")}>
              ☰
            </button>
          )}
          <button class={`icon-btn ${syncing.value ? "spin" : ""}`} aria-label="Обновить" disabled={syncing.value} onClick={() => syncDrive(true)}>
            ⟳
          </button>
        </header>
        {t === "week" && <WeekTab />}
        {t === "new" && <NewTab />}
        {t === "marked" && <MarkedTab />}
        {t === "settings" && <SettingsTab />}
      </div>
      {o && <PostScreen o={o} />}
      {!o && (
        <nav class="tabs">
          {(Object.keys(TAB_LABEL) as Tab[]).map((k) => (
            <button class={t === k ? "on" : ""} key={k} onClick={() => (tab.value = k)}>
              <span class="ti">{TAB_ICON[k]}</span>
              {TAB_LABEL[k]}
              {k === "new" && <b class="count">{entries.value.filter((e) => e.status === null && topicVisible(e)).length}</b>}
            </button>
          ))}
        </nav>
      )}
      <Sheets />
      {toast.value && <div class="toast">{toast.value}</div>}
    </div>
  );
}
