// Fields of a FormDefinition in the shape lib/pdfSearch.js matches against the text of the original PDF.
import { SECTION_TYPES } from "./formDefinition.js";

const GRID_KEYS = ["repeatingSectionGrid", "repetingSectionGrid"];

function childQuestions(field) {
  const key = GRID_KEYS.find((name) => Array.isArray(field?.[name]));
  return key ? field[key] : [];
}

const byPosition = (a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0);

/**
 * [{ id, title, parentId, group, context }] in display order (pages, then rows and columns).
 * group: a section, highlighted on the PDF through the fields inside it; context: title of the form page.
 * The order matters: fields of one section usually sit next to each other on paper.
 */
export function pdfFieldsOf(form) {
  const fields = [];
  const visit = (questions, parentId, context) => {
    [...(questions || [])]
      .filter((question) => question?.field)
      .sort(byPosition)
      .forEach((question) => {
        const field = question.field;
        const children = childQuestions(field);
        if (field.id != null) {
          fields.push({
            id: field.id,
            title: String(field.title ?? "").trim(),
            parentId,
            group: SECTION_TYPES.has(field.type) || children.length > 0,
            context,
          });
        }
        if (children.length) visit(children, field.id ?? parentId, context);
      });
  };
  (form?.tabs || []).forEach((tab) => visit(tab?.questions, null, tab?.title ?? ""));
  return fields;
}
