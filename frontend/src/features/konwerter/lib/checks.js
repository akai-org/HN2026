// Sprawdzenia formularza przed zatwierdzeniem. Reguły pochodzą z materiałów COI:
// „Reguły techniczne konfiguracji formularzy”, „Standardy i dobre praktyki projektowania formularzy”,
// „Dane inicjalne” i „Słowniki”. Każda uwaga może wskazywać pole (fieldId), żeby dało się do niego przejść.
import { compileQuery, referencedTechNames } from "./conditions.js";
import { FIELD_TYPES, asArray, indexForm, isAutoFilled, isInputType, isRequired, validatorNames } from "./formModel.js";
import { isKnownRegistryRef } from "./registry.js";

export const ALLOWED_VALIDATORS = ["REQUIRED", "EMAIL", "PESEL", "NIP", "REGON", "ZIP_CODE", "EPUAP", "ADE", "SERIAL_NUMBER_ID_CARD"];
const MAX_TITLE = 255;
const TECH_NAME_RE = /^[a-z][a-z0-9_]*$/;

/** Reguły pokazywane jako lista „spełnia / nie spełnia”. */
export const RULES = [
  { id: "structure", label: "Tytuł, strony i kolejność stron" },
  { id: "techNames", label: "Unikalne nazwy techniczne pól" },
  { id: "labels", label: "Każde pole ma etykietę" },
  { id: "choices", label: "Pola wyboru mają opcje albo słownik" },
  { id: "conditions", label: "Warunki wskazują istniejące pola" },
  { id: "required", label: "Pola obowiązkowe są oznaczone" },
  { id: "registry", label: "Dane z rejestrów pochodzą z dozwolonych źródeł" },
  { id: "consent", label: "Formularz ma zgodę na przetwarzanie danych" },
  { id: "validators", label: "Walidatory z listy dozwolonych" },
];

function fieldName(field) {
  return field.title?.trim() ? `„${field.title.trim()}”` : field.techName ? `„${field.techName}”` : "bez nazwy";
}

/**
 * @param {object} form FormDefinition
 * @param {{ warnings?: string[], conditionErrors?: {fieldId:string, message:string}[] }} extra
 * @returns {{ issues: {id:string, level:'error'|'warning'|'info', rule:string, title:string, detail?:string, fieldId?:string}[], rules: {id:string, label:string, passed:boolean}[] }}
 */
export function runChecks(form, { warnings = [], conditionErrors = [] } = {}) {
  const issues = [];
  const add = (issue) => issues.push({ id: `${issue.rule}-${issues.length}`, ...issue });

  warnings.forEach((text) => add({ level: "warning", rule: "server", title: text }));

  if (!form || typeof form !== "object" || Array.isArray(form)) {
    add({ level: "error", rule: "structure", title: "To nie jest definicja formularza (oczekiwany obiekt z polem tabs)." });
    return finish(issues);
  }

  const tabs = Array.isArray(form.tabs) ? form.tabs : [];
  if (!String(form.title ?? "").trim()) add({ level: "error", rule: "structure", title: "Formularz nie ma tytułu." });
  else if (form.title.length > MAX_TITLE) add({ level: "error", rule: "structure", title: `Tytuł formularza ma ponad ${MAX_TITLE} znaków.` });
  if (!tabs.some((tab) => tab?.type !== "FINISH")) add({ level: "error", rule: "structure", title: "Formularz nie ma żadnej strony z polami." });
  if (tabs.length && !tabs.some((tab) => tab?.type === "FINISH")) {
    add({ level: "warning", rule: "structure", title: "Brakuje strony końcowej (typ FINISH) z podglądem wniosku." });
  }
  const tabIds = new Set(tabs.map((tab) => tab?.id));
  for (const link of form.flow?.links ?? []) {
    if (!tabIds.has(link.source) || !tabIds.has(link.target)) {
      add({ level: "error", rule: "structure", title: "Kolejność stron (flow) wskazuje stronę, której nie ma." });
      break;
    }
  }

  const { entries, byTech } = indexForm(form);
  const ids = new Map();

  for (const [techName, list] of byTech) {
    if (list.length > 1) {
      add({
        level: "error",
        rule: "techNames",
        title: `Nazwa techniczna „${techName}” powtarza się ${list.length} razy.`,
        detail: "Warunki i dane wniosku rozpoznają pola po nazwie technicznej, więc musi być unikalna.",
        fieldId: list[1].field.id,
      });
    }
  }

  let anyRequired = false;
  let hasConsent = false;

  for (const { field } of entries) {
    const type = field.type;
    if (field.id) {
      if (ids.has(field.id)) add({ level: "error", rule: "techNames", title: `Identyfikator pola ${fieldName(field)} się powtarza.`, fieldId: field.id });
      ids.set(field.id, true);
    }
    if (!FIELD_TYPES[type]) {
      add({ level: "error", rule: "structure", title: `Pole ${fieldName(field)} ma nieznany typ „${type}”.`, fieldId: field.id });
      continue;
    }
    if (!field.techName) add({ level: "error", rule: "techNames", title: `Pole ${fieldName(field)} nie ma nazwy technicznej.`, fieldId: field.id });
    else if (!TECH_NAME_RE.test(field.techName)) {
      add({ level: "info", rule: "techNames", title: `Nazwa techniczna „${field.techName}” nie jest w formacie snake_case.`, fieldId: field.id });
    }
    if ((field.title ?? "").length > MAX_TITLE) add({ level: "error", rule: "labels", title: `Etykieta pola ${fieldName(field)} ma ponad ${MAX_TITLE} znaków.`, fieldId: field.id });
    if (type === "CONSENT_SECTION") hasConsent = true;
    if (isRequired(field) && type !== "CONSENT_SECTION") anyRequired = true;

    if (isInputType(type) && type !== "CONSENT_SECTION" && !String(field.title ?? "").trim()) {
      add({ level: "error", rule: "labels", title: `Pole typu ${FIELD_TYPES[type].label.toLowerCase()} nie ma etykiety.`, detail: "Mieszkaniec nie będzie wiedział, co wpisać.", fieldId: field.id });
    }

    if (FIELD_TYPES[type].choice) {
      const options = asArray(field.options);
      if (!field.dictionaryName && options.length === 0) {
        add({ level: "error", rule: "choices", title: `Pole ${fieldName(field)} nie ma opcji ani słownika.`, fieldId: field.id });
      }
      if (field.dictionaryName && options.length > 0) {
        add({ level: "warning", rule: "choices", title: `Pole ${fieldName(field)} ma jednocześnie słownik i własne opcje.`, detail: "Przy słowniku lista opcji powinna być pusta.", fieldId: field.id });
      }
      if (type === "RADIO" && options.length > 5) {
        add({ level: "warning", rule: "choices", title: `Pole ${fieldName(field)} ma ${options.length} opcji jednokrotnego wyboru.`, detail: "Przy więcej niż 5 opcjach standard zaleca listę rozwijaną.", fieldId: field.id });
      }
      if (type === "SELECT" && options.length > 15 && !field.searchEnabled) {
        add({ level: "info", rule: "choices", title: `Lista ${fieldName(field)} ma ${options.length} opcji bez wyszukiwania.`, fieldId: field.id });
      }
      if (options.some((option) => option?.id !== undefined && option.id !== option.name)) {
        add({ level: "warning", rule: "choices", title: `W polu ${fieldName(field)} identyfikator opcji różni się od jej nazwy.`, fieldId: field.id });
      }
    }

    for (const state of asArray(field.states)) {
      if (typeof state?.query !== "string") continue;
      const compiled = compileQuery(state.query);
      if (compiled.error) {
        add({ level: "error", rule: "conditions", title: `Warunek pola ${fieldName(field)} ma błąd składni.`, detail: compiled.error, fieldId: field.id });
        continue;
      }
      const missing = referencedTechNames(state.query).filter((name) => !byTech.has(name));
      if (missing.length) {
        add({ level: "error", rule: "conditions", title: `Warunek pola ${fieldName(field)} wskazuje pole, którego nie ma: ${missing.join(", ")}.`, fieldId: field.id });
      }
    }

    if (isAutoFilled(field) && !isKnownRegistryRef(field.defaultValue)) {
      add({ level: "warning", rule: "registry", title: `Pole ${fieldName(field)} pobiera dane z nieznanego źródła „${field.defaultValue}”.`, fieldId: field.id });
    }

    if (field.validation !== undefined && !Array.isArray(field.validation)) {
      add({ level: "info", rule: "validators", title: `Pole ${fieldName(field)} ma „validation” zapisane jako obiekt zamiast listy.`, fieldId: field.id });
    }
    const unknown = validatorNames(field).filter((name) => !ALLOWED_VALIDATORS.includes(name));
    if (unknown.length) add({ level: "warning", rule: "validators", title: `Pole ${fieldName(field)} ma nieznany walidator: ${unknown.join(", ")}.`, fieldId: field.id });
  }

  conditionErrors.forEach((error) => {
    add({ level: "error", rule: "conditions", title: "Nie udało się policzyć warunku pola.", detail: error.message, fieldId: error.fieldId });
  });

  if (!anyRequired && entries.some((entry) => isInputType(entry.field.type))) {
    add({ level: "warning", rule: "required", title: "Żadne pole nie jest oznaczone jako obowiązkowe.", detail: "Bez tego mieszkaniec może wysłać niepełny wniosek. Zaznacz pole i włącz „Obowiązkowe”." });
  }
  if (!hasConsent) add({ level: "warning", rule: "consent", title: "Formularz nie ma sekcji zgód (CONSENT_SECTION)." });

  return finish(issues);
}

const LEVEL_ORDER = { error: 0, warning: 1, info: 2 };

function finish(issues) {
  const sorted = [...issues].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const failing = new Set(issues.filter((issue) => issue.level !== "info").map((issue) => issue.rule));
  return { issues: sorted, rules: RULES.map((rule) => ({ ...rule, passed: !failing.has(rule.id) })) };
}
