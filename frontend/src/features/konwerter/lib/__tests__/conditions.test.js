import { describe, expect, it } from "vitest";
import { describeQuery, evaluateStates, referencedTechNames, techTitleMap } from "../conditions.js";
import { indexForm, initialAnswers } from "../formModel.js";
import { resolveRegistryValue } from "../registry.js";
import { loadExample, loadForm1 } from "./fixtures.js";

const form = loadExample();
const index = indexForm(form);
const id = (techName) => index.byTech.get(techName)[0].field.id;

describe("evaluateStates", () => {
  it("pokazuje kod pocztowy tylko dla adresu w Polsce", async () => {
    const answers = initialAnswers(form, resolveRegistryValue);
    const poland = await evaluateStates(form, answers);
    expect(poland.errors).toEqual([]);
    expect(poland.states[id("kod_pocztowy")].visible).toBe(true);

    const abroad = await evaluateStates(form, { ...answers, [id("kraj")]: ["Niemcy"] });
    expect(abroad.states[id("kod_pocztowy")].visible).toBe(false);
  });

  it("ukrywa sekcję i jej pola, dopóki nie wybierzesz odpowiedniej opcji", async () => {
    const hidden = await evaluateStates(form, {});
    const section = id("dane_podmiotu");
    expect(hidden.states[section].visible).toBe(false);
    const child = index.entries.find((entry) => entry.parentId === section);
    expect(hidden.states[child.field.id].visible).toBe(false);

    const shown = await evaluateStates(form, {
      [id("wybierz_w_czyim_imieniu_wnioskujesz")]: "Osoby prawnej lub jednostki organizacyjnej",
    });
    expect(shown.states[section].visible).toBe(true);
    expect(shown.states[child.field.id].visible).toBe(true);
  });

  it("zgłasza błąd składni zamiast ukrywać pole", async () => {
    const broken = structuredClone(form);
    broken.tabs[0].questions[0].field.states = [{ type: "SHOW", query: "tabs[" }];
    const result = await evaluateStates(broken, {});
    expect(result.errors).toHaveLength(1);
    expect(result.states[broken.tabs[0].questions[0].field.id].visible).toBe(true);
  });
});

describe("formularz 1 (niepełne pola)", () => {
  it("liczy warunki bez błędów", async () => {
    const form1 = loadForm1();
    const result = await evaluateStates(form1, initialAnswers(form1, resolveRegistryValue));
    expect(result.errors).toEqual([]);
    expect(Object.keys(result.states).length).toBeGreaterThan(50);
  });
});

describe("describeQuery", () => {
  it("opisuje warunek po ludzku", () => {
    const query = index.byTech.get("kod_pocztowy")[0].field.states[0].query;
    expect(describeQuery(query, techTitleMap(form))).toBe("w polu „Kraj” wybrano „Polska”");
  });

  it("zwraca null dla nietypowego wyrażenia", () => {
    expect(describeQuery("$count(tabs) > 1", new Map())).toBeNull();
  });

  it("wypisuje techName, do których odwołuje się wyrażenie", () => {
    const query = index.byTech.get("kod_pocztowy")[0].field.states[0].query;
    expect(referencedTechNames(query)).toEqual(["adres_zamieszkania", "kraj"]);
  });
});
