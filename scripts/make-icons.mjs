// Рисует иконки приложения из SVG: `npm run icons`.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

// Тёмный фон на весь холст (iOS сам скругляет углы), стопка карточек с галочкой «разобрано».
// Maskable режется по центральному кругу, поэтому для него содержимое уменьшается (inset < 1).
const svg = (inset) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#183a38"/><stop offset="1" stop-color="#121212"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${inset}) translate(-256 -256)">
    <rect x="118" y="146" width="236" height="272" rx="34" fill="#2b5e59" transform="rotate(-8 236 282)"/>
    <rect x="150" y="104" width="244" height="290" rx="34" fill="#4fb3a5"/>
    <g fill="#0d2f2c">
      <rect x="190" y="156" width="164" height="22" rx="11"/>
      <rect x="190" y="204" width="164" height="14" rx="7" opacity="0.55"/>
      <rect x="190" y="236" width="164" height="14" rx="7" opacity="0.55"/>
      <rect x="190" y="268" width="104" height="14" rx="7" opacity="0.55"/>
    </g>
    <circle cx="340" cy="352" r="50" fill="#f2c94c"/>
    <path d="M316 352 l18 18 l30 -36" fill="none" stroke="#0d2f2c" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const jobs = [
  ["icon-512.png", 512, 1],
  ["icon-512-maskable.png", 512, 0.72],
  ["icon-192.png", 192, 1],
  ["apple-touch-icon.png", 180, 1],
];
for (const [name, size, inset] of jobs) {
  await sharp(Buffer.from(svg(inset))).resize(size, size).png().toFile(new URL(name, out).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  console.log("ok", name);
}
