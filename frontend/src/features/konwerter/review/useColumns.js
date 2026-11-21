// Układ kolumn ekranu sprawdzania: które są włączone, w jakiej kolejności i jak szerokie.
// Zapamiętywany w localStorage, bo urzędnik zwykle pracuje w jednym, wybranym układzie.
import { useCallback, useEffect, useState } from "react";

export const COLUMN_IDS = ["original", "form", "json"];
export const COLUMN_LABELS = { original: "Oryginał", form: "Formularz", json: "JSON" };
export const MIN_WIDTH = 18;

const STORAGE_KEY = "konwerter.kolumny";
const DEFAULT_LAYOUT = {
  order: ["original", "form", "json"],
  visible: { original: true, form: true, json: true },
  widths: { original: 30, form: 38, json: 32 },
};

function sanitize(layout) {
  const order = Array.isArray(layout?.order) && layout.order.length === 3 && COLUMN_IDS.every((id) => layout.order.includes(id)) ? layout.order : DEFAULT_LAYOUT.order;
  const visible = { ...DEFAULT_LAYOUT.visible, ...(layout?.visible ?? {}) };
  if (!COLUMN_IDS.some((id) => visible[id])) visible.form = true;
  const widths = { ...DEFAULT_LAYOUT.widths };
  for (const id of COLUMN_IDS) {
    const value = Number(layout?.widths?.[id]);
    if (Number.isFinite(value) && value >= MIN_WIDTH && value <= 100) widths[id] = value;
  }
  return { order, visible, widths };
}

function read() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/**
 * Układ ograniczony do dostępnych kolumn (np. bez „Oryginału”, gdy formularz nie pochodzi z PDF-a).
 * Gdy zostaje zero widocznych, pokazujemy wszystkie dostępne.
 */
export function restrictLayout(layout, available) {
  const order = layout.order.filter((id) => available.includes(id));
  const visible = Object.fromEntries(order.map((id) => [id, layout.visible[id]]));
  if (!order.some((id) => visible[id])) order.forEach((id) => (visible[id] = true));
  return { ...layout, order, visible };
}

/** Szerokości widocznych kolumn w procentach (sumują się do 100). */
export function visibleWidths(layout) {
  const ids = layout.order.filter((id) => layout.visible[id]);
  const total = ids.reduce((sum, id) => sum + layout.widths[id], 0) || 1;
  return ids.map((id) => ({ id, percent: (layout.widths[id] / total) * 100 }));
}

export function useColumns() {
  const [layout, setLayout] = useState(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Bez localStorage układ działa do odświeżenia strony.
    }
  }, [layout]);

  const toggle = useCallback((id) => {
    setLayout((current) => {
      const visible = { ...current.visible, [id]: !current.visible[id] };
      if (!COLUMN_IDS.some((key) => visible[key])) return current; // zawsze zostaje co najmniej jedna kolumna
      return { ...current, visible };
    });
  }, []);

  const show = useCallback((id) => setLayout((current) => ({ ...current, visible: { ...current.visible, [id]: true } })), []);

  /** Przenosi kolumnę `id` na pozycję kolumny `targetId` (przeciąganie) albo o krok (delta). */
  const move = useCallback((id, { targetId, delta }) => {
    setLayout((current) => {
      const order = [...current.order];
      const from = order.indexOf(id);
      let to = targetId ? order.indexOf(targetId) : from + delta;
      if (!targetId) {
        // Krok w lewo/prawo przeskakuje kolumny wyłączone, żeby ruch był widoczny.
        while (to >= 0 && to < order.length && !current.visible[order[to]]) to += delta;
      }
      if (to < 0 || to >= order.length || to === from) return current;
      order.splice(from, 1);
      order.splice(to, 0, id);
      return { ...current, order };
    });
  }, []);

  /** Zmienia szerokość pary sąsiednich kolumn (delta w punktach procentowych). */
  const resize = useCallback((leftId, rightId, delta) => {
    setLayout((current) => {
      const shares = visibleWidths(current);
      const left = shares.find((entry) => entry.id === leftId);
      const right = shares.find((entry) => entry.id === rightId);
      if (!left || !right) return current;
      const pair = left.percent + right.percent;
      const nextLeft = Math.min(Math.max(left.percent + delta, MIN_WIDTH), pair - MIN_WIDTH);
      const widths = Object.fromEntries(shares.map((entry) => [entry.id, entry.percent]));
      widths[leftId] = nextLeft;
      widths[rightId] = pair - nextLeft;
      return { ...current, widths: { ...current.widths, ...widths } };
    });
  }, []);

  const reset = useCallback(() => setLayout(DEFAULT_LAYOUT), []);

  return { layout, toggle, show, move, resize, reset };
}

/** Szeroki ekran: kolumny obok siebie. Węższy: jedna kolumna z zakładkami. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
