import { describe, expect, it } from "vitest";
import {
  deleteField,
  dependentsOf,
  formStats,
  getAt,
  indexForm,
  initialAnswers,
  isRequired,
  moveField,
  questionPathFromJsonPath,
  renameField,
  setRequired,
  tabsInOrder,
  walkForm,
} from "../formModel.js";
import { loadExample } from "./fixtures.js";

const form = loadExample();

describe("walkForm / indexForm", () => {
  it("przechodzi także po polach zagnieżdżonych w sekcjach", () => {
    const entries = walkForm(form);
    const kod = entries.find((entry) => entry.field.techName === "kod_pocztowy");
    expect(kod).toBeDefined();
    expect(kod.depth).toBe(1);
    expect(kod.path).toContain("repeatingSectionGrid");
    expect(getAt(form, kod.path).field).toBe(kod.field);
  });

  it("ścieżka każdego wpisu wskazuje to samo pole w JSON-ie", () => {
    for (const entry of walkForm(form)) expect(getAt(form, entry.path).field).toBe(entry.field);
  });

  it("indeksuje pola po id i techName", () => {
    const index = indexForm(form);
    const entry = index.byTech.get("uzasadnienie")[0];
    expect(index.byId.get(entry.field.id)).toBe(entry);
    expect(index.byPath.get(entry.pathKey)).toBe(entry);
  });

  it("stawia stronę końcową na końcu i trzyma kolejność z flow", () => {
    const tabs = tabsInOrder(form).map((entry) => entry.tab.title);
    expect(tabs).toEqual(["Dane", "Informacje o nadpłacie", "Kontakt i zgody", "Strona końcowa"]);
  });
});

describe("formStats", () => {
  it("liczy strony, pola i dane z rejestrów jak w makiecie (4 strony, 52 pola, 9 z rejestru)", () => {
    const stats = formStats(form);
    expect(stats.pages).toBe(3);
    expect(stats.tabs).toBe(4);
    expect(stats.fields).toBe(52);
    expect(stats.autoFilled).toBe(9);
    expect(stats.dictionaries).toEqual(expect.arrayContaining(["Kraje", "TERYT_4G_DOWODOWY"]));
  });
});

describe("questionPathFromJsonPath", () => {
  it("znajduje najbliższe pytanie dla kursora w środku pola", () => {
    expect(questionPathFromJsonPath(["tabs", 0, "questions", 3, "field", "repeatingSectionGrid", 2, "field", "title"])).toEqual([
      "tabs", 0, "questions", 3, "field", "repeatingSectionGrid", 2,
    ]);
    expect(questionPathFromJsonPath(["tabs", 1, "title"])).toEqual(["tabs", 1]);
    expect(questionPathFromJsonPath(["title"])).toBeNull();
  });
});

describe("edycje", () => {
  const target = indexForm(form).byTech.get("uzasadnienie")[0].field;

  it("zmienia etykietę bez ruszania oryginału", () => {
    const next = renameField(form, target.id, "Dlaczego powstała nadpłata?");
    expect(indexForm(next).byId.get(target.id).field.title).toBe("Dlaczego powstała nadpłata?");
    expect(target.title).toBe("Uzasadnienie");
  });

  it("włącza i wyłącza walidator REQUIRED", () => {
    const required = setRequired(form, target.id, true);
    expect(isRequired(indexForm(required).byId.get(target.id).field)).toBe(true);
    const optional = setRequired(required, target.id, false);
    expect(indexForm(optional).byId.get(target.id).field.validation).toEqual([]);
  });

  it("usuwa pole", () => {
    const next = deleteField(form, target.id);
    expect(indexForm(next).byId.has(target.id)).toBe(false);
    expect(walkForm(next)).toHaveLength(walkForm(form).length - 1);
  });

  it("przesuwa pole w górę, zamieniając pozycje z sąsiadem", () => {
    const before = indexForm(form).byId.get(target.id).question.y;
    const next = moveField(form, target.id, -1);
    expect(indexForm(next).byId.get(target.id).question.y).toBeLessThan(before);
  });

  it("znajduje pola zależne od odpowiedzi w innym polu", () => {
    const dependents = dependentsOf(form, "kraj");
    expect(dependents.map((entry) => entry.field.techName)).toContain("kod_pocztowy");
  });
});

describe("initialAnswers", () => {
  it("bierze defaultValue i dane z rejestru", () => {
    const answers = initialAnswers(form, (ref) => `[${ref}]`);
    const index = indexForm(form);
    expect(answers[index.byTech.get("kraj")[0].field.id]).toEqual(["Polska"]);
    const pesel = index.entries.find((entry) => entry.field.defaultValue === "PESEL.pesel");
    expect(answers[pesel.field.id]).toBe("[PESEL.pesel]");
  });
});
