// Helpers for reading a FormDefinition (the JSON returned by POST /api/forms/convert).

export const VALIDATOR_LABELS = {
  EMAIL: "E-mail",
  PESEL: "PESEL",
  NIP: "NIP",
  REGON: "REGON",
  ZIP_CODE: "Kod pocztowy",
  EPUAP: "ePUAP",
  ADE: "e-Doręczenia",
  SERIAL_NUMBER_ID_CARD: "Nr dowodu osobistego",
};

export const SECTION_TYPES = new Set(["SECTION", "REPEATING_SECTION"]);

// `validation` is an array in the schema, but the example files also have `"validation": {}`.
function validationOf(field) {
  return Array.isArray(field?.validation) ? field.validation : [];
}

export function isRequired(field) {
  return validationOf(field).includes("REQUIRED");
}

/** Format validators of the field (everything except REQUIRED). */
export function fieldValidators(field) {
  return validationOf(field).filter((name) => name !== "REQUIRED");
}

/** Plain-text paragraphs of an HTML description. DOMParser builds an inert document: no scripts, no requests. */
export function htmlParagraphs(html) {
  if (!html || !html.includes("<")) return html?.trim() ? [html.trim()] : [];
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const blocks = [...body.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6")].filter(
    (element) => !element.querySelector("p, li"),
  );
  return (blocks.length ? blocks : [body])
    .map((element) => element.textContent.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Polish plural: plural(5, "pole", "pola", "pól") → "pól". */
export function plural(count, one, few, many) {
  if (count === 1) return one;
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

/**
 * Every section and field of the form with its page, plus lookups:
 * - `byId`: id → {node, tabIndex, kind: "section" | "field"},
 * - `titles`: "sectionTechName|fieldTechName" → field title (for describing conditions),
 * - `fieldCount`: input fields, without sections and text blocks.
 */
export function indexForm(form) {
  const byId = new Map();
  const fieldIds = new Set();
  const titles = new Map();
  let fieldCount = 0;

  (form?.tabs || []).forEach((tab, tabIndex) => {
    (tab.questions || []).forEach((question) => {
      const section = question?.field;
      if (!section) return;
      byId.set(section.id, { node: section, tabIndex, kind: "section" });
      (section.repeatingSectionGrid || []).forEach((item) => {
        const field = item?.field;
        if (!field) return;
        byId.set(field.id, { node: field, tabIndex, kind: "field" });
        fieldIds.add(field.id);
        titles.set(`${section.techName}|${field.techName}`, field.title);
        if (!["TEXT_BLOCK", "INFO_SECTION"].includes(field.type)) fieldCount += 1;
      });
    });
  });

  return { byId, fieldIds, titles, fieldCount };
}

// `("Opcja" in tabs['Strona' in title].questions['sekcja' in field.techName].field.repeatingSectionGrid['pole' in field.techName].field.__userAnswer)`
// and the repeating-section variant from Reguły techniczne; `$not(...)` negates.
const CONDITION =
  /(\$not)?\(\s*"((?:[^"\\]|\\.)*)"\s+in\s+tabs\[.*?\]\.questions\['((?:[^'\\]|\\.)*)'\s+in\s+field\.techName\]\.field\.(?:repeatingSectionGrid\['((?:[^'\\]|\\.)*)'\s+in\s+field\.techName\]\.field\.__userAnswer|__userAnswer\[\$repeatingSectionIndex\]\['((?:[^'\\]|\\.)*)'\s+in\s+fieldTechName\]\.answers)/g;

/** Human-readable SHOW condition, e.g. `„Kraj” = „Polska”`; null when the node has none. */
export function describeShowCondition(states, titles) {
  const queries = (states || []).filter((state) => state?.type === "SHOW").map((state) => state.query || "");
  if (!queries.length) return null;

  const parts = queries.map((query) => {
    const conditions = [...query.matchAll(CONDITION)].map(
      ([, not, value, section, field, repeatingField]) => {
        const techName = field ?? repeatingField;
        const title = titles.get(`${section}|${techName}`) || techName;
        return `„${title}” ${not ? "≠" : "="} „${value.replace(/\\(.)/g, "$1")}”`;
      },
    );
    if (!conditions.length) return "warunek JSONata";
    return conditions.join(/\)\s+or\s+/.test(query) ? " lub " : " i ");
  });
  return parts.join(" i ");
}

/** Splits a rule warning `"Message (tabs[1].questions[0].field...)"` into text and the node it points at. */
export function resolveWarning(warning, form) {
  const match = /^(.*)\s\(((?:tabs|flow)[^()]*)\)$/s.exec(warning);
  if (!match) return { text: warning, path: "", tabIndex: null, id: null };

  const [, text, path] = match;
  const location =
    /^tabs\[(\d+)\](?:\.questions\[(\d+)\](?:\.field(?:\.repeatingSectionGrid\[(\d+)\])?)?)?/.exec(path);
  if (!location) return { text, path, tabIndex: null, id: null };

  const [, tab, question, item] = location.map((value) => (value === undefined ? undefined : Number(value)));
  const section = question === undefined ? null : form?.tabs?.[tab]?.questions?.[question]?.field;
  const node = item === undefined ? section : section?.repeatingSectionGrid?.[item]?.field;
  return { text, path, tabIndex: form?.tabs?.[tab] ? tab : null, id: node?.id ?? null };
}

/** Copy of `value` with the object whose `id` is `id` swapped for `replacement`; untouched branches are reused. */
export function replaceNode(value, id, replacement) {
  if (Array.isArray(value)) {
    const next = value.map((entry) => replaceNode(entry, id, replacement));
    return next.some((entry, index) => entry !== value[index]) ? next : value;
  }
  if (!value || typeof value !== "object") return value;
  if (value.id === id) return replacement;

  const entries = Object.entries(value).map(([key, entry]) => [key, replaceNode(entry, id, replacement)]);
  return entries.some(([key, entry]) => entry !== value[key]) ? Object.fromEntries(entries) : value;
}

/** Saves the form (the importable FormDefinition) as a .json file named after its title. */
export function downloadJson(form) {
  const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug(form?.title || "") || "formularz"}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** ASCII file-name version of a title: "Wniosek o zwrot opłaty" → "Wniosek_o_zwrot_oplaty". */
function slug(text) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}
