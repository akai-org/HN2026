// Grupowanie plików w formularze. Jeden formularz = jedna grupa plików
// (np. zdjęcia kolejnych stron). Wszystkie funkcje są czyste: dostają tablicę grup
// i zwracają nową, dzięki czemu łatwo je testować i używać w reducerze.
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from "./files.js";
import { baseName, formatSize } from "./text.js";

export const EDITABLE_STATUSES = new Set(["ready", "error"]);

/** Nowa grupa z domyślnymi polami. */
export function createGroup(id, props = {}) {
  return {
    id,
    name: "",
    nameEdited: false,
    folder: "",
    itemIds: [],
    status: "ready",
    error: "",
    startedAt: 0,
    finishedAt: 0,
    result: null,
    source: null,
    doc: null,
    approved: false,
    origin: "upload",
    ...props,
  };
}

/** Grupę można przebudowywać (dzielić, łączyć), dopóki nie trwa ani nie zakończyło się rozpoznawanie. */
export function isEditable(group) {
  return group.origin === "upload" && EDITABLE_STATUSES.has(group.status);
}

function lastSegment(path) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Domyślna nazwa: nazwa folderu albo nazwa pierwszego pliku bez rozszerzenia. */
export function defaultName(group, itemsById) {
  if (group.folder) return lastSegment(group.folder);
  const first = itemsById[group.itemIds[0]];
  return first ? baseName(first.name) : "Formularz";
}

/** Po zmianie składu grupy wynik rozpoznania przestaje być aktualny. */
function resetGroup(group, itemsById) {
  const next = {
    ...group,
    status: "ready",
    error: "",
    startedAt: 0,
    finishedAt: 0,
    result: null,
    source: null,
    doc: null,
    approved: false,
  };
  if (!next.nameEdited) next.name = defaultName(next, itemsById);
  return next;
}

function withoutEmpty(groups) {
  return groups.filter((group) => group.itemIds.length > 0 || group.origin !== "upload");
}

/**
 * Dodaje nowe pliki. entries: [{ id, name, folder }].
 * Pliki z tego samego folderu trafiają do jednej grupy (folder = jeden formularz),
 * luźne pliki dostają osobne grupy.
 */
export function addEntries(groups, entries, itemsById, makeId) {
  const next = [...groups];
  for (const entry of entries) {
    if (entry.folder) {
      const index = next.findIndex((group) => group.folder === entry.folder && isEditable(group));
      if (index >= 0) {
        next[index] = resetGroup({ ...next[index], itemIds: [...next[index].itemIds, entry.id] }, itemsById);
        continue;
      }
      const group = createGroup(makeId(), { folder: entry.folder, itemIds: [entry.id] });
      next.push({ ...group, name: defaultName(group, itemsById) });
    } else {
      const group = createGroup(makeId(), { itemIds: [entry.id] });
      next.push({ ...group, name: defaultName(group, itemsById) });
    }
  }
  return next;
}

/** Rozdziela grupę: plik `itemId` i kolejne tworzą nowy formularz zaraz za bieżącym. */
export function splitAt(groups, groupId, itemId, itemsById, makeId) {
  const index = groups.findIndex((group) => group.id === groupId);
  if (index < 0 || !isEditable(groups[index])) return groups;
  const group = groups[index];
  const at = group.itemIds.indexOf(itemId);
  if (at <= 0) return groups;
  const head = resetGroup({ ...group, itemIds: group.itemIds.slice(0, at) }, itemsById);
  const tail = createGroup(makeId(), { itemIds: group.itemIds.slice(at) });
  const named = { ...tail, name: defaultName(tail, itemsById) };
  return [...groups.slice(0, index), head, named, ...groups.slice(index + 1)];
}

/** Dołącza pliki grupy do poprzedniej (np. druga strona tego samego wniosku). */
export function mergeWithPrevious(groups, groupId, itemsById) {
  const index = groups.findIndex((group) => group.id === groupId);
  if (index <= 0) return groups;
  const current = groups[index];
  const previous = groups[index - 1];
  if (!isEditable(current) || !isEditable(previous)) return groups;
  const merged = resetGroup({ ...previous, itemIds: [...previous.itemIds, ...current.itemIds] }, itemsById);
  return [...groups.slice(0, index - 1), merged, ...groups.slice(index + 1)];
}

/**
 * Przesuwa plik o jedną pozycję (delta = -1 w górę, +1 w dół).
 * Na granicy grupy plik przechodzi do sąsiedniego formularza, więc klawiaturą
 * da się ułożyć dowolny podział bez przeciągania.
 */
export function moveItem(groups, itemId, delta, itemsById) {
  const gIndex = groups.findIndex((group) => group.itemIds.includes(itemId));
  if (gIndex < 0 || !isEditable(groups[gIndex])) return groups;
  const group = groups[gIndex];
  const at = group.itemIds.indexOf(itemId);
  const target = at + delta;
  const next = [...groups];

  if (target >= 0 && target < group.itemIds.length) {
    const ids = [...group.itemIds];
    [ids[at], ids[target]] = [ids[target], ids[at]];
    next[gIndex] = resetGroup({ ...group, itemIds: ids }, itemsById);
    return next;
  }

  const neighbourIndex = gIndex + delta;
  const neighbour = groups[neighbourIndex];
  if (!neighbour || !isEditable(neighbour)) return groups;
  const remaining = group.itemIds.filter((id) => id !== itemId);
  const neighbourIds = delta < 0 ? [...neighbour.itemIds, itemId] : [itemId, ...neighbour.itemIds];
  next[gIndex] = resetGroup({ ...group, itemIds: remaining }, itemsById);
  next[neighbourIndex] = resetGroup({ ...neighbour, itemIds: neighbourIds }, itemsById);
  return withoutEmpty(next);
}

/** Usuwa plik; pusta grupa znika. */
export function removeItem(groups, itemId, itemsById) {
  const next = groups.map((group) =>
    group.itemIds.includes(itemId)
      ? resetGroup({ ...group, itemIds: group.itemIds.filter((id) => id !== itemId) }, itemsById)
      : group,
  );
  return withoutEmpty(next);
}

/** Łączy wszystkie edytowalne grupy w jeden formularz (w kolejności na liście). */
export function mergeAll(groups, itemsById) {
  const editable = groups.filter(isEditable);
  if (editable.length < 2) return groups;
  const [first] = editable;
  const merged = resetGroup(
    { ...first, folder: "", nameEdited: false, itemIds: editable.flatMap((group) => group.itemIds) },
    itemsById,
  );
  const result = [];
  for (const group of groups) {
    if (group.id === first.id) result.push(merged);
    else if (!isEditable(group)) result.push(group);
  }
  return result;
}

/** Każdy plik z edytowalnych grup staje się osobnym formularzem. */
export function splitAll(groups, itemsById, makeId) {
  const result = [];
  for (const group of groups) {
    if (!isEditable(group) || group.itemIds.length < 2) {
      result.push(group);
      continue;
    }
    group.itemIds.forEach((itemId, index) => {
      const base = index === 0 ? { ...group, folder: "", nameEdited: false, itemIds: [itemId] } : createGroup(makeId(), { itemIds: [itemId] });
      result.push(resetGroup(base, itemsById));
    });
  }
  return result;
}

export function renameGroup(groups, groupId, name) {
  const trimmed = name.trim();
  return groups.map((group) =>
    group.id === groupId ? { ...group, name: trimmed || group.name, nameEdited: Boolean(trimmed) } : group,
  );
}

/**
 * Problem, który blokuje rozpoznanie grupy, albo null.
 * Word i arkusze nie dają się połączyć z innymi plikami w jeden PDF.
 */
export function groupProblem(group, itemsById) {
  const items = group.itemIds.map((id) => itemsById[id]).filter(Boolean);
  if (items.length > 1) {
    const blocking = items.filter((item) => !item.type?.mergeable);
    if (blocking.length > 0) {
      return {
        code: "NOT_MERGEABLE",
        message:
          "Plików Word i arkuszy nie łączymy z innymi plikami. Rozdziel ten formularz albo zostaw w nim tylko PDF-y i zdjęcia.",
      };
    }
    const total = items.reduce((sum, item) => sum + item.size, 0);
    if (total > MAX_FILE_SIZE * 1.5) {
      return {
        code: "TOO_LARGE",
        message: `Pliki razem mają ${formatSize(total)}. Po połączeniu przekroczą limit ${MAX_FILE_SIZE_MB} MB, więc podziel je na mniejsze formularze.`,
      };
    }
  }
  return null;
}

/** Statystyki do paska podsumowania. */
export function groupStats(groups) {
  const stats = { total: groups.length, ready: 0, queued: 0, processing: 0, done: 0, error: 0, approved: 0 };
  for (const group of groups) {
    stats[group.status] = (stats[group.status] ?? 0) + 1;
    if (group.approved) stats.approved += 1;
  }
  return stats;
}
