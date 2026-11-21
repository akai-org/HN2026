import { describe, expect, it } from "vitest";
import { normalizeResult } from "../api.js";
import { applyForm, applyText, createDoc, redo, undo } from "../doc.js";
import { rejectionReason } from "../files.js";
import { indexForm, questionPathFromJsonPath, renameField } from "../formModel.js";
import { buildTree, lineColumn, parseJson, pathAtOffset, rangeForPath } from "../jsonPositions.js";
import { formatSize, plural } from "../text.js";
import { loadExample } from "./fixtures.js";

const form = loadExample();

describe("jsonPositions", () => {
  const doc = createDoc(form);
  const tree = buildTree(doc.text);
  const entry = indexForm(form).byTech.get("kod_pocztowy")[0];

  it("znajduje zakres pola w tekście", () => {
    const range = rangeForPath(tree, entry.path);
    const fragment = JSON.parse(doc.text.slice(range.from, range.to));
    expect(fragment.field.techName).toBe("kod_pocztowy");
  });

  it("z pozycji kursora wraca do tego samego pola", () => {
    const range = rangeForPath(tree, entry.path);
    const inside = doc.text.indexOf('"title"', range.from) + 3;
    const path = questionPathFromJsonPath(pathAtOffset(tree, inside));
    expect(path).toEqual(entry.path);
  });

  it("opisuje błąd składni po polsku z numerem linii", () => {
    const result = parseJson('{\n  "title": "A",\n  "tabs": [\n}');
    expect(result.error.line).toBe(4);
    expect(result.error.message).toMatch(/brakuje|wartości|nawiasu/);
  });

  it("liczy linię i kolumnę", () => {
    expect(lineColumn("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
  });
});

describe("doc (historia zmian)", () => {
  it("błędny JSON nie psuje podglądu, a cofnięcie przywraca poprzedni tekst", () => {
    const doc = createDoc(form);
    const broken = applyText(doc, `${doc.text.slice(0, -1)}`, 1000);
    expect(broken.error).not.toBeNull();
    expect(broken.form).toBe(form);
    const back = undo(broken);
    expect(back.text).toBe(doc.text);
    expect(redo(back).text).toBe(broken.text);
  });

  it("zmiana z podglądu przepisuje JSON i trafia do historii", () => {
    const doc = createDoc(form);
    const id = indexForm(form).byTech.get("kwota")[0].field.id;
    const next = applyForm(doc, renameField(form, id, "Kwota nadpłaty"), 1000);
    expect(next.text).toContain('"title": "Kwota nadpłaty"');
    expect(next.past).toHaveLength(1);
  });
});

describe("api.normalizeResult", () => {
  it("przyjmuje odpowiedź backendu i sam FormDefinition", () => {
    expect(normalizeResult({ form, warnings: ["a", { message: "b" }] }).warnings).toEqual(["a", "b"]);
    expect(normalizeResult(form).form).toBe(form);
    expect(() => normalizeResult({ foo: 1 })).toThrow();
  });

  it("odczytuje opcjonalny PDF z serwera", () => {
    expect(normalizeResult({ form, pdf_url: "/x.pdf" }).sourcePdf).toEqual({ url: "/x.pdf" });
  });
});

describe("pliki i teksty", () => {
  const file = (name, size = 100) => ({ name, size, lastModified: 1 });
  it("odrzuca pliki tak jak backend", () => {
    expect(rejectionReason(file("a.exe"))).toMatch(/nieobsługiwany/);
    expect(rejectionReason(file("skan%1.png"))).toMatch(/niedozwolone/);
    expect(rejectionReason(file("a.pdf", 0))).toMatch(/pusty/);
    expect(rejectionReason(file("a.pdf", 11 * 1024 * 1024))).toMatch(/limit/);
    expect(rejectionReason(file("a.pdf"), [file("a.pdf")])).toMatch(/już na liście/);
    expect(rejectionReason(file("Wniosek.JPG"))).toBeNull();
  });

  it("odmienia i formatuje", () => {
    expect([1, 2, 5, 12, 22].map((n) => plural(n, ["plik", "pliki", "plików"]))).toEqual(["plik", "pliki", "plików", "plików", "pliki"]);
    expect(formatSize(2.4 * 1024 * 1024)).toBe("2,4 MB");
  });
});
