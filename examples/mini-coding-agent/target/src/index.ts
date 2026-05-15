import { log } from "./logger.ts";
import { Store } from "./store.ts";

export function main(): void {
  const store = new Store();
  store.set("greeting", "hello");
  log("info", `stored greeting=${String(store.get("greeting"))}`);
  store.delete("greeting");
  log("info", `size after delete=${store.size()}`);
}
