// Рисует иконки приложения из SVG: `npm run icons`.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

// Тёмный фон на весь холст (iOS сам скругляет углы), фиолетовая нота — в гамме приложения.
// Maskable режется по центральному кругу, поэтому для него содержимое уменьшается (inset < 1).
const svg = (inset) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#183a38"/><stop offset="1" stop-color="#121212"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${inset}) translate(-256 -256)" fill="#4fb3a5">
    <rect x="290" y="130" width="36" height="210" rx="12"/>
    <path d="M290 130 L400 160 L400 214 L290 184 Z"/>
    <ellipse cx="236" cy="346" rx="66" ry="52"/>
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
