// Model formularza COI (FormDefinition): przechodzenie po polach, statystyki i edycje.
// Kształt danych jak w plikach wzorcowych z dane_zadania (konfiguracja_form_*.json):
//   form.title, form.tabs[] (MAIN/FINISH), tab.questions[] { x, y, rows, cols, field },
//   pola sekcji siedzą w field.repeatingSectionGrid (schemat ma literówkę „repetingSectionGrid”,
//   obsługujemy obie nazwy), form.flow.links[] wyznacza kolejność stron.

export const FIELD_TYPES = {
  TEXT_FIELD: { label: "Pole tekstowe", input: true },
  NUMBER: { label: "Liczba", input: true },
  TEXTAREA: { label: "Dłuższy tekst", input: true },
  DATEPICKER: { label: "Data", input: true },
  RADIO: { label: "Jednokrotny wybór", input: true, choice: true },
  CHECKBOX: { label: "Pola wyboru", input: true, choice: true },
  SELECT: { label: "Lista rozwijana", input: true, choice: true },
  FILE_UPLOADER: { label: "Załącznik", input: true },
  CONSENT_SECTION: { label: "Zgody", input: true },
  TEXT_BLOCK: { label: "Tekst informacyjny" },
  INFO_SECTION: { label: "Ramka informacyjna" },
  SECTION: { label: "Sekcja", container: true },
  REPEATING_SECTION: { label: "Sekcja powtarzalna", container: true },
};

export const GRID_COLUMNS = 3;
const GRID_KEYS = ["repeatingSectionGrid", "repetingSectionGrid"];
const LIST_KEYS = new Set(["questions", ...GRID_KEYS]);

/** Wartość jako tablica: dane z modelu bywają niepełne (np. "validation": {} albo brak "states"). */
export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function typeLabel(type) {
  return FIELD_TYPES[type]?.label ?? type ?? "Nieznany typ";
}

export function isInputType(type) {
  return Boolean(FIELD_TYPES[type]?.input);
}

export function isContainerType(type) {
  return Boolean(FIELD_TYPES[type]?.container);
}

/** Klucz z polami zagnieżdżonymi (sekcje) albo null. */
export function gridKey(field) {
  return GRID_KEYS.find((key) => Array.isArray(field?.[key])) ?? null;
}

export function childQuestions(field) {
  const key = gridKey(field);
  return key ? field[key] : [];
}

/** Kolejność wyświetlania: wiersz, potem kolumna, potem questionOrder. */
export function compareQuestions(a, b) {
  return (
    (a.y ?? 0) - (b.y ?? 0) ||
    (a.x ?? 0) - (b.x ?? 0) ||
    (a.field?.questionOrder ?? 0) - (b.field?.questionOrder ?? 0)
  );
}

/** Indeksy pytań w kolejności wyświetlania (bez zmiany tablicy źródłowej). */
export function orderedIndexes(questions) {
  return questions
    .map((question, index) => ({ question, index }))
    .sort((a, b) => compareQuestions(a.question, b.question))
    .map((entry) => entry.index);
}

export function pathKey(path) {
  return path.join("/");
}

/** Strony w kolejności z flow.links; strona końcowa (FINISH) zawsze na końcu. */
export function tabsInOrder(form) {
  const tabs = asArray(form?.tabs)
    .map((tab, index) => ({ tab, index }))
    .filter((entry) => entry.tab && typeof entry.tab === "object");
  const links = asArray(form?.flow?.links);
  if (tabs.length === 0) return [];
  const byId = new Map(tabs.map((entry) => [entry.tab.id, entry]));
  const targets = new Set(links.map((link) => link.target));
  const start = tabs.find((entry) => !targets.has(entry.tab.id) && entry.tab.type !== "FINISH") ?? tabs[0];
  const ordered = [];
  const seen = new Set();
  let current = start;
  while (current && !seen.has(current.tab.id)) {
    ordered.push(current);
    seen.add(current.tab.id);
    const link = links.find((candidate) => candidate.source === current.tab.id);
    current = link ? byId.get(link.target) : undefined;
  }
  for (const entry of tabs) if (!seen.has(entry.tab.id)) ordered.push(entry);
  return [...ordered.filter((e) => e.tab.type !== "FINISH"), ...ordered.filter((e) => e.tab.type === "FINISH")];
}

/**
 * Wszystkie pola formularza w kolejności wyświetlania, także zagnieżdżone w sekcjach.
 * Każdy wpis zna ścieżkę w JSON-ie (path), więc da się go podświetlić w edytorze.
 */
export function walkForm(form) {
  const entries = [];
  const visit = (questions, basePath, ctx) => {
    for (const index of orderedIndexes(questions)) {
      const question = questions[index];
      if (!question || typeof question !== "object") continue;
      const path = [...basePath, index];
      const field = question.field ?? {};
      const entry = {
        field,
        question,
        path,
        pathKey: pathKey(path),
        tabIndex: ctx.tabIndex,
        tabId: ctx.tabId,
        parentId: ctx.parentId,
        depth: ctx.depth,
      };
      entries.push(entry);
      const key = gridKey(field);
      if (key) {
        visit(field[key], [...path, "field", key], { ...ctx, parentId: field.id ?? null, depth: ctx.depth + 1 });
      }
    }
  };
  for (const { tab, index } of tabsInOrder(form)) {
    visit(asArray(tab.questions), ["tabs", index, "questions"], {
      tabIndex: index,
      tabId: tab.id,
      parentId: null,
      depth: 0,
    });
  }
  return entries;
}

/** Indeks do szybkiego wyszukiwania pól po id, techName i ścieżce. */
export function indexForm(form) {
  const entries = walkForm(form);
  const byId = new Map();
  const byTech = new Map();
  const byPath = new Map();
  for (const entry of entries) {
    if (entry.field.id) byId.set(entry.field.id, entry);
    if (entry.field.techName) {
      const list = byTech.get(entry.field.techName) ?? [];
      list.push(entry);
      byTech.set(entry.field.techName, list);
    }
    byPath.set(entry.pathKey, entry);
  }
  return { entries, byId, byTech, byPath };
}

/** Ścieżka JSON (np. z kursora w edytorze) → ścieżka najbliższego pytania albo strony. */
export function questionPathFromJsonPath(jsonPath) {
  for (let i = jsonPath.length - 1; i > 0; i -= 1) {
    if (typeof jsonPath[i] === "number" && LIST_KEYS.has(jsonPath[i - 1])) return jsonPath.slice(0, i + 1);
  }
  if (jsonPath[0] === "tabs" && typeof jsonPath[1] === "number") return jsonPath.slice(0, 2);
  return null;
}

export function getAt(root, path) {
  return path.reduce((node, key) => (node == null ? undefined : node[key]), root);
}

/** Czy pole jest obowiązkowe (walidator REQUIRED jako tekst albo obiekt). */
export function isRequired(field) {
  if (field?.type === "CONSENT_SECTION") {
    return asArray(field.consentSectionConfig?.consents).some((consent) => consent?.required);
  }
  return asArray(field?.validation).some((rule) => rule === "REQUIRED" || rule?.type === "REQUIRED" || rule?.name === "REQUIRED");
}

/** Walidatory jako lista nazw (np. ["REQUIRED", "PESEL"]). */
export function validatorNames(field) {
  return asArray(field?.validation).map((rule) => (typeof rule === "string" ? rule : rule?.type ?? rule?.name ?? "")).filter(Boolean);
}

export function isAutoFilled(field) {
  return field?.defaultValueType === "EXTERNAL_SYSTEM";
}

export function formStats(form) {
  const { entries } = indexForm(form);
  const inputs = entries.filter((entry) => isInputType(entry.field.type));
  const mainTabs = asArray(form?.tabs).filter((tab) => tab?.type !== "FINISH");
  return {
    pages: mainTabs.length,
    tabs: asArray(form?.tabs).length,
    fields: inputs.length,
    required: inputs.filter((entry) => entry.field.type !== "CONSENT_SECTION" && isRequired(entry.field)).length,
    autoFilled: inputs.filter((entry) => isAutoFilled(entry.field)).length,
    conditional: entries.filter((entry) => asArray(entry.field.states).length > 0).length,
    sections: entries.filter((entry) => isContainerType(entry.field.type)).length,
    dictionaries: [...new Set(inputs.map((entry) => entry.field.dictionaryName).filter(Boolean))],
  };
}

// ---------- edycje (zawsze zwracają nowy obiekt formularza) ----------

function locate(form, fieldId) {
  const entry = indexForm(form).byId.get(fieldId);
  if (!entry) throw new Error(`Nie ma pola o id ${fieldId}`);
  return entry;
}

function editField(form, fieldId, mutate) {
  const { path } = locate(form, fieldId);
  const next = structuredClone(form);
  const question = getAt(next, path);
  question.field = question.field ?? {};
  mutate(question.field, question);
  return next;
}

export function renameField(form, fieldId, title) {
  return editField(form, fieldId, (field) => {
    field.title = title;
  });
}

export function setRequired(form, fieldId, required) {
  return editField(form, fieldId, (field) => {
    if (field.type === "CONSENT_SECTION") {
      for (const consent of asArray(field.consentSectionConfig?.consents)) consent.required = required;
      return;
    }
    const rules = asArray(field.validation).filter(
      (rule) => !(rule === "REQUIRED" || rule?.type === "REQUIRED" || rule?.name === "REQUIRED"),
    );
    field.validation = required ? ["REQUIRED", ...rules] : rules;
  });
}

export function setDescription(form, fieldId, html) {
  return editField(form, fieldId, (field) => {
    field.description = html;
  });
}

/** Usuwa pole (razem z zawartością, jeśli to sekcja). */
export function deleteField(form, fieldId) {
  const { path } = locate(form, fieldId);
  const next = structuredClone(form);
  const list = getAt(next, path.slice(0, -1));
  list.splice(path[path.length - 1], 1);
  return next;
}

/**
 * Przesuwa pole o jedno miejsce wśród rodzeństwa (delta -1 wyżej, +1 niżej):
 * zamienia pozycje x/y i questionOrder z sąsiadem.
 */
export function moveField(form, fieldId, delta) {
  const { path } = locate(form, fieldId);
  const next = structuredClone(form);
  const list = getAt(next, path.slice(0, -1));
  const order = orderedIndexes(list);
  const at = order.indexOf(path[path.length - 1]);
  const neighbour = order[at + delta];
  if (neighbour === undefined) return form;
  const a = list[order[at]];
  const b = list[neighbour];
  for (const key of ["x", "y"]) [a[key], b[key]] = [b[key], a[key]];
  if (a.field && b.field) [a.field.questionOrder, b.field.questionOrder] = [b.field.questionOrder, a.field.questionOrder];
  [list[order[at]], list[neighbour]] = [list[neighbour], list[order[at]]];
  return next;
}

/** Pola, których warunki (states) odwołują się do pola o danym techName. */
export function dependentsOf(form, techName) {
  if (!techName) return [];
  const needle = `'${techName}' in field.techName`;
  const alt = `"${techName}" in field.techName`;
  return walkForm(form).filter((entry) =>
    asArray(entry.field.states).some((state) => typeof state?.query === "string" && (state.query.includes(needle) || state.query.includes(alt))),
  );
}

/** Domyślne odpowiedzi do podglądu: defaultValue albo dane z rejestru (dla EXTERNAL_SYSTEM). */
export function initialAnswers(form, resolveExternal) {
  const answers = {};
  for (const { field } of walkForm(form)) {
    if (!field.id || !isInputType(field.type)) continue;
    if (isAutoFilled(field)) {
      answers[field.id] = resolveExternal(field.defaultValue);
    } else if (field.type === "CONSENT_SECTION") {
      answers[field.id] = asArray(field.consentSectionConfig?.consents).map(() => false);
    } else if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "") {
      answers[field.id] = structuredClone(field.defaultValue);
    }
  }
  return answers;
}
