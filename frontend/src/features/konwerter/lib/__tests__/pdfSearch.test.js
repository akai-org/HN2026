import { describe, expect, it } from "vitest";
import { findText, normalize, sameWord } from "../pdfSearch.js";

const pages = [
  { items: ["Ulan-Majorat, dnia", "Wnioskodawca:", "Nazwisko i imię/Nazwa firmy", "PESEL *", "NIP *"] },
  { items: ["Uzasadnienie:", "Kwotę nadpłaty proszę:", "1) zaliczyć na poczet", "przyszłego zobowiązania"] },
];

describe("pdfSearch", () => {
  it("normalizuje polskie znaki i interpunkcję", () => {
    expect(normalize("Imię/Nazwa ŁÓDŹ")).toBe("imie nazwa lodz");
  });

  it("toleruje odmianę słów", () => {
    expect(sameWord("kwota", "kwote")).toBe(true);
    expect(sameWord("imie", "imienia")).toBe(true);
    expect(sameWord("pesel", "nip")).toBe(false);
  });

  it("znajduje całe słowo w dłuższej etykiecie", () => {
    expect(findText(pages, "Imię")).toEqual({ page: 1, indices: [2], exact: true });
  });

  it("znajduje frazę rozbitą na kilka fragmentów", () => {
    expect(findText([{ items: ["Numer", "PESEL"] }], "Numer PESEL")).toEqual({ page: 1, indices: [0, 1], exact: true });
  });

  it("dopasowuje po słowach na innej stronie", () => {
    expect(findText(pages, "Numer PESEL")).toMatchObject({ page: 1, indices: [3] });
    expect(findText(pages, "Kwota")).toMatchObject({ page: 2, indices: [1] });
  });

  it("woli krótką etykietę niż przypis z tą samą frazą", () => {
    const withFootnote = [{ items: ["PESEL *", "Numer PESEL wpisują podatnicy będący osobami fizycznymi objętymi rejestrem PESEL nieprowadzący działalności"] }];
    expect(findText(withFootnote, "Numer PESEL")).toMatchObject({ indices: [0] });
  });

  it("nie zgaduje, gdy nic nie pasuje", () => {
    expect(findText(pages, "Adres e-mail")).toBeNull();
    expect(findText(pages, "Kod pocztowy")).toBeNull();
    expect(findText(pages, "")).toBeNull();
  });
});
