/** Статус, который пользователь ставит посту. Пока отметки нет — пост «новый». */
export type Status = "read" | "rejected" | "idea" | "later";

export const STATUS_LABEL: Record<Status, string> = {
  read: "Прочитал",
  rejected: "Отверг",
  idea: "Хорошая идея",
  later: "Посмотреть потом",
};

export interface Post {
  id: number;
  url: string;
  informative?: boolean;
  title: string;
  summary: string;
  full_text?: string;
  /** Текст поста с Telegram-форматированием (жирный, ссылки, цитаты); появляется у рутин позже. */
  full_html?: string;
  media_only?: boolean;
  images?: string[];
  image_count?: number;
  date?: string;
}

export interface Channel {
  username: string;
  title: string;
  range?: [number, number];
  read?: number;
  informative?: number;
  week_summary?: string;
  posts: Post[];
}

/** Один JSON из Drive: тема + неделя (у GameDev — ещё и группа каналов). */
export interface DigestFile {
  schema: number;
  topic: string;
  group?: string | number;
  year: number;
  week: number;
  note?: string;
  channels: Channel[];
  unavailable_channels?: unknown[];
}

/** Неделя темы после склейки всех групп. */
export interface Week {
  key: string; // topic|year|week
  topic: string;
  year: number;
  week: number;
  channels: Channel[];
}

/** Запись журнала отметок. Журнал только дописывается; побеждает запись с большим ts. */
export interface Mark {
  key: string; // topic|year|week|channel|postId
  status: Status | null; // null — отметка снята
  /** Идея или «позже» уже отработаны и лежат в архиве. */
  archived?: boolean;
  ts: number;
  device: string;
}
