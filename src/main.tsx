import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import { initStore, ready } from "./core/store";
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

void boot();

// Новая версия ставится в фоне и подхватывается при следующем открытии.
registerSW({ immediate: true });
