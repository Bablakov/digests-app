import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import { setKey } from "./core/drive";
import { initStore, ready, showToast, syncDrive } from "./core/store";
import "./styles.css";
import { App } from "./ui/App";

render(<App />, document.getElementById("app")!);

async function boot(): Promise<void> {
  try {
    // Просим браузер не вычищать данные при нехватке места.
    void navigator.storage?.persist?.().catch(() => {});
    await initStore();
  } catch (e) {
    // Без IndexedDB (приватный режим старого Safari) приложение всё равно открывается — пустым.
    console.error("boot failed", e);
    ready.value = true;
  }
}

/**
 * Ссылка `…/#key=AIza…` один раз сохраняет ключ Drive на устройстве; из адреса он тут же стирается.
 */
async function applyLink(): Promise<void> {
  const m = /[#&]key=([^&]+)/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  await setKey(decodeURIComponent(m[1]));
  showToast("Ключ Drive сохранён");
}

void boot()
  .then(applyLink)
  .then(() => syncDrive());

// Возвращаясь в приложение, снова проверяем Drive.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void syncDrive();
});

// Новая версия ставится в фоне и подхватывается при следующем открытии.
registerSW({ immediate: true });
