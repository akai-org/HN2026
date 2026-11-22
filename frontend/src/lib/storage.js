// JSON in Web Storage. Storage can be unavailable (private mode, blocked site data), so a failed read
// returns the fallback and a failed write is skipped: everything kept here is only a convenience.

function jsonStorage(getStorage) {
  return {
    read(key, fallback) {
      try {
        const raw = getStorage().getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        getStorage().setItem(key, JSON.stringify(value));
      } catch {
        // Not remembered this time.
      }
    },
  };
}

export const localStore = jsonStorage(() => window.localStorage);
export const sessionStore = jsonStorage(() => window.sessionStorage);
