import { describe, expect, it } from "vitest";
import { runChecks } from "../checks.js";
import { indexForm } from "../formModel.js";
import { loadExample, loadForm1 } from "./fixtures.js";

const form = loadExample();

describe("runChecks", () => {
  it("wzorcowy formularz nie ma błędów, tylko uwagę o polach obowiązkowych", () => {
    const { issues, rules } = runChecks(form);
    expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
    expect(issues.some((issue) => issue.rule === "required")).toBe(true);
    expect(rules.find((rule) => rule.id === "required").passed).toBe(false);
    expect(rules.find((rule) => rule.id === "conditions").passed).toBe(true);
  });

  it("wykrywa powtórzony techName i wskazuje pole", () => {
    const broken = structuredClone(form);
    const entries = indexForm(broken).entries.filter((entry) => entry.depth === 1);
    entries[1].field.techName = entries[0].field.techName;
    const { issues } = runChecks(broken);
    const duplicate = issues.find((issue) => issue.rule === "techNames" && issue.level === "error");
    expect(duplicate).toBeDefined();
    expect(duplicate.fieldId).toBeTruthy();
  });

  it("wykrywa warunek wskazujący nieistniejące pole", () => {
    const broken = structuredClone(form);
    const field = indexForm(broken).byTech.get("kod_pocztowy")[0].field;
    field.states[0].query = field.states[0].query.replace("'kraj'", "'kraj_x'");
    const { issues } = runChecks(broken);
    expect(issues.some((issue) => issue.rule === "conditions" && issue.title.includes("kraj_x"))).toBe(true);
  });

  it("przekazuje ostrzeżenia z serwera", () => {
    const { issues } = runChecks(form, { warnings: ["Nie rozpoznano pola na stronie 2"] });
    expect(issues.some((issue) => issue.rule === "server")).toBe(true);
  });

  it("radzi sobie z niepełnymi danymi z prawdziwego JSON-a (validation: {}, brak states)", () => {
    const form1 = loadForm1();
    const { issues } = runChecks(form1);
    expect(issues.some((issue) => issue.title.includes("zamiast listy"))).toBe(true);
    expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("nie wywraca się na danych, które nie są formularzem", () => {
    expect(runChecks([]).issues[0].level).toBe("error");
  });
});
