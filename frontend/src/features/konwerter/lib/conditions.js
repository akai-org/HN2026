// Warunki pól (field.states) zapisane w JSONata, np.:
//   ("Polska" in tabs['Dane' in title].questions['adres' in field.techName]
//      .field.repeatingSectionGrid['kraj' in field.techName].field.__userAnswer)
// Wyrażenie liczymy na lekkiej kopii formularza, w której każde pole ma __userAnswer
// z odpowiedzią wpisaną w podglądzie. Dzięki temu podgląd działa jak prawdziwa eUsługa.
import jsonata from "jsonata";
import { asArray, childQuestions, walkForm } from "./formModel.js";

const cache = new Map();

/** Kompiluje wyrażenie (z pamięcią podręczną). Zwraca { expression } albo { error }. */
export function compileQuery(query) {
  if (cache.has(query)) return cache.get(query);
  let compiled;
  try {
    compiled = { expression: jsonata(query) };
  } catch (error) {
    compiled = { error: error?.message ?? String(error) };
  }
  if (cache.size > 500) cache.clear();
  cache.set(query, compiled);
  return compiled;
}

function mapQuestions(questions, answers) {
  return (questions ?? []).map((question) => {
    const field = question?.field ?? {};
    const grid = mapQuestions(childQuestions(field), answers);
    return {
      x: question?.x,
      y: question?.y,
      field: {
        id: field.id,
        type: field.type,
        techName: field.techName,
        title: field.title,
        __userAnswer: answers[field.id],
        repeatingSectionGrid: grid,
        repetingSectionGrid: grid,
      },
    };
  });
}

/** Dane, na których liczone są wyrażenia: struktura formularza + odpowiedzi. */
export function buildConditionData(form, answers) {
  return {
    title: form?.title,
    tabs: asArray(form?.tabs).map((tab) => ({
      id: tab?.id,
      title: tab?.title,
      type: tab?.type,
      questions: mapQuestions(asArray(tab?.questions), answers),
    })),
  };
}

async function evaluate(query, data) {
  const compiled = compileQuery(query);
  if (compiled.error) return { error: compiled.error };
  try {
    return { value: Boolean(await compiled.expression.evaluate(data)) };
  } catch (error) {
    return { error: error?.message ?? String(error) };
  }
}

/**
 * Stan każdego pola przy danych odpowiedziach.
 * SHOW: pole widoczne, gdy warunek jest spełniony (wszystkie SHOW muszą być spełnione).
 * HIDE: odwrotnie. READ_ONLY / DISABLED: pole zablokowane. REQUIRED: obowiązkowe.
 * Ukrycie sekcji ukrywa jej pola. Błędne wyrażenie nie ukrywa pola (zgłaszamy je jako błąd).
 * @returns {Promise<{ states: Record<string, {visible:boolean, readOnly:boolean, required:boolean, ownVisible:boolean}>, errors: {fieldId:string, query:string, message:string}[] }>}
 */
export async function evaluateStates(form, answers) {
  const data = buildConditionData(form, answers);
  const entries = walkForm(form);
  const errors = [];
  const own = new Map();

  await Promise.all(
    entries.map(async ({ field }) => {
      let visible = true;
      let readOnly = Boolean(field.readOnly);
      let required = false;
      for (const state of asArray(field.states)) {
        if (typeof state?.query !== "string" || !state.query.trim()) continue;
        const result = await evaluate(state.query, data);
        if (result.error) {
          errors.push({ fieldId: field.id, query: state.query, message: result.error });
          continue;
        }
        if (state.type === "SHOW") visible = visible && result.value;
        else if (state.type === "HIDE") visible = visible && !result.value;
        else if (state.type === "READ_ONLY" || state.type === "DISABLED") readOnly = readOnly || result.value;
        else if (state.type === "REQUIRED") required = required || result.value;
      }
      own.set(field.id, { visible, readOnly, required });
    }),
  );

  const states = {};
  for (const { field, parentId } of entries) {
    const self = own.get(field.id) ?? { visible: true, readOnly: false, required: false };
    const parent = parentId ? states[parentId] : null;
    states[field.id] = {
      ...self,
      ownVisible: self.visible,
      visible: self.visible && (parent ? parent.visible : true),
      readOnly: self.readOnly || Boolean(parent?.readOnly),
    };
  }
  return { states, errors };
}

const CONDITION_RE = /"([^"]+)"\s+in\s+(tabs\[.*?)\.field\.__userAnswer/g;
const TECH_RE = /['"]([^'"]+)['"]\s+in\s+field\.techName/g;

/** Wszystkie techName, do których odwołuje się wyrażenie (także nazwy sekcji po drodze). */
export function referencedTechNames(query) {
  if (typeof query !== "string") return [];
  return [...query.matchAll(TECH_RE)].map((match) => match[1]);
}

/**
 * Opis warunku po ludzku, np. „w polu „Kraj” wybrano „Polska””.
 * titles: Map techName → tytuł pola. Zwraca null, gdy wyrażenie ma nietypową postać.
 */
export function describeQuery(query, titles) {
  if (typeof query !== "string") return null;
  const parts = [];
  for (const match of query.matchAll(CONDITION_RE)) {
    const techNames = [...match[2].matchAll(TECH_RE)].map((m) => m[1]);
    const techName = techNames[techNames.length - 1];
    if (!techName) continue;
    const title = titles?.get(techName) || techName;
    parts.push(`w polu „${title}” wybrano „${match[1]}”`);
  }
  if (parts.length === 0) return null;
  const joiner = /\)\s+or\s+\(|\s+or\s+/.test(query) ? " lub " : " i ";
  const text = parts.join(joiner);
  return /\$not\s*\(/.test(query) ? `nie jest prawdą, że ${text}` : text;
}

/** Mapa techName → tytuł (do opisów warunków). */
export function techTitleMap(form) {
  const map = new Map();
  for (const { field } of walkForm(form)) {
    if (field.techName && !map.has(field.techName)) map.set(field.techName, field.title || field.techName);
  }
  return map;
}
