import { effect, signal, type Signal } from "@preact/signals";

/** Сигнал, который помнит значение в localStorage (если он доступен). */
function persisted<T>(name: string, initial: T): Signal<T> {
  let value = initial;
  try {
    const raw = localStorage.getItem(`digest.${name}`);
    if (raw !== null) value = JSON.parse(raw) as T;
  } catch {
    /* приватный режим — работаем без памяти */
  }
  const s = signal<T>(value);
  effect(() => {
    try {
      localStorage.setItem(`digest.${name}`, JSON.stringify(s.value));
    } catch {
      /* ignore */
    }
  });
  return s;
}

export type TextSize = "s" | "m" | "l";
export type StatusMode = "all" | "new" | "done";

/** Темы, скрытые фильтром. Новая тема по умолчанию видна. */
export const hiddenTopics = persisted<string[]>("hiddenTopics", []);
export const statusMode = persisted<StatusMode>("statusMode", "all");
export const textSize = persisted<TextSize>("textSize", "m");
export const swipeEnabled = persisted<boolean>("swipeEnabled", true);
