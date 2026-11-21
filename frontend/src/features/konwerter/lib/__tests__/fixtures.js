import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../../public/przyklady/", import.meta.url));

/** Wzorcowy JSON COI (formularz 5) — kopia z dane_zadania w public/przyklady. */
export function loadExample(name = "wniosek-o-stwierdzenie-nadplaty-podatku") {
  return JSON.parse(readFileSync(`${root}${name}.json`, "utf8"));
}
