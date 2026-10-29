/** Теги Telegram-форматирования, которые разрешено показывать. Остальное превращается в обычный текст. */
const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "CODE", "PRE", "BR", "BLOCKQUOTE", "A", "P", "DIV", "SPAN", "TG-SPOILER"]);

/** Чистит HTML поста: оставляет разметку Telegram, убирает скрипты, обработчики и опасные ссылки. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walk = (node: Element): void => {
    for (const child of [...node.children]) {
      walk(child);
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) {
        const keep = child.tagName === "A" && attr.name === "href";
        if (!keep) child.removeAttribute(attr.name);
      }
      if (child.tagName === "A") {
        const href = child.getAttribute("href") ?? "";
        if (/^(https?:\/\/|tg:\/\/|mailto:)/i.test(href)) {
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer");
        } else {
          child.removeAttribute("href");
        }
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
