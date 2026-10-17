// Versioned localStorage save. Private windows and blocked storage must never break play:
// every read and write is guarded, and a bad or old save falls back to a fresh one.

export interface Store<T> {
  load(): T;
  save(v: T, now?: boolean): void;
  reset(): T;
}

export function createStore<T extends object>(key: string, version: number, fresh: () => T): Store<T> {
  const k = key + ".v" + version;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(k);
        if (!raw) return fresh();
        const v = JSON.parse(raw);
        if (!v || typeof v !== "object") return fresh();
        return Object.assign(fresh(), v) as T;
      } catch {
        return fresh();
      }
    },
    save(v: T, now?: boolean) {
      const write = () => {
        try {
          window.localStorage.setItem(k, JSON.stringify(v));
        } catch {
          /* storage unavailable: play continues for this visit */
        }
      };
      if (timer) clearTimeout(timer);
      if (now) write();
      else timer = setTimeout(write, 250);
    },
    reset() {
      try {
        window.localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
      return fresh();
    },
  };
}
