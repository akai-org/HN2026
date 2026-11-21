import { describe, expect, it } from "vitest";
import { FILE_TYPES } from "../files.js";
import { addEntries, groupProblem, mergeAll, mergeWithPrevious, moveItem, removeItem, splitAll, splitAt } from "../grouping.js";

function setup(specs) {
  const items = {};
  specs.forEach(([id, name, folder = ""], index) => {
    const ext = name.split(".").pop();
    items[id] = { id, name, size: 1000 * (index + 1), folder, type: FILE_TYPES[ext] };
  });
  let seq = 0;
  const makeId = () => `g${++seq}`;
  const groups = addEntries([], Object.values(items), items, makeId);
  return { items, groups, makeId };
}

describe("addEntries", () => {
  it("pliki z jednego folderu tworzą jeden formularz, luźne pliki osobne", () => {
    const { groups } = setup([
      ["a", "str1.jpg", "Skany/Wniosek A"],
      ["b", "str2.jpg", "Skany/Wniosek A"],
      ["c", "inny.pdf"],
      ["d", "str1.jpg", "Skany/Wniosek B"],
    ]);
    expect(groups.map((group) => group.itemIds)).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(groups.map((group) => group.name)).toEqual(["Wniosek A", "inny", "Wniosek B"]);
  });
});

describe("dzielenie i łączenie", () => {
  it("rozdziela formularz od wskazanego pliku", () => {
    const { groups, items, makeId } = setup([
      ["a", "s1.jpg", "F"],
      ["b", "s2.jpg", "F"],
      ["c", "s3.jpg", "F"],
    ]);
    const next = splitAt(groups, groups[0].id, "b", items, makeId);
    expect(next.map((group) => group.itemIds)).toEqual([["a"], ["b", "c"]]);
  });

  it("łączy z poprzednim formularzem i resetuje wynik", () => {
    const { groups, items } = setup([["a", "s1.jpg"], ["b", "s2.jpg"]]);
    const done = [{ ...groups[0], status: "error", error: "x" }, groups[1]];
    const next = mergeWithPrevious(done, groups[1].id, items);
    expect(next).toHaveLength(1);
    expect(next[0].itemIds).toEqual(["a", "b"]);
    expect(next[0].status).toBe("ready");
    expect(next[0].error).toBe("");
  });

  it("nie rusza formularzy w trakcie rozpoznawania", () => {
    const { groups, items } = setup([["a", "s1.jpg"], ["b", "s2.jpg"]]);
    const busy = [{ ...groups[0], status: "processing" }, groups[1]];
    expect(mergeWithPrevious(busy, groups[1].id, items)).toBe(busy);
  });

  it("przesuwa plik między formularzami na ich granicy", () => {
    const { groups, items } = setup([["a", "s1.jpg"], ["b", "s2.jpg"], ["c", "s3.jpg"]]);
    const up = moveItem(groups, "b", -1, items);
    expect(up.map((group) => group.itemIds)).toEqual([["a", "b"], ["c"]]);
    const down = moveItem(up, "a", 1, items);
    expect(down.map((group) => group.itemIds)).toEqual([["b", "a"], ["c"]]);
  });

  it("łączy wszystko i dzieli z powrotem", () => {
    const { groups, items, makeId } = setup([["a", "s1.jpg"], ["b", "s2.jpg"], ["c", "s3.jpg"]]);
    const merged = mergeAll(groups, items);
    expect(merged.map((group) => group.itemIds)).toEqual([["a", "b", "c"]]);
    const split = splitAll(merged, items, makeId);
    expect(split.map((group) => group.itemIds)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("usuwa pusty formularz razem z ostatnim plikiem", () => {
    const { groups, items } = setup([["a", "s1.jpg"], ["b", "s2.jpg"]]);
    expect(removeItem(groups, "a", items).map((group) => group.itemIds)).toEqual([["b"]]);
  });
});

describe("groupProblem", () => {
  it("nie pozwala łączyć Worda z innymi plikami", () => {
    const { groups, items } = setup([["a", "s1.jpg", "F"], ["b", "wniosek.docx", "F"]]);
    expect(groupProblem(groups[0], items)?.code).toBe("NOT_MERGEABLE");
  });

  it("pojedynczy Word jest w porządku", () => {
    const { groups, items } = setup([["a", "wniosek.docx"]]);
    expect(groupProblem(groups[0], items)).toBeNull();
  });
});
