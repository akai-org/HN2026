// Dane do podglądu formularza: wycinki słowników i fikcyjna osoba z rejestrów.
// W prawdziwej eUsłudze słowniki i dane inicjalne dostarcza platforma; tu tylko je symulujemy,
// żeby urzędnik zobaczył, jak pole będzie wyglądało dla mieszkańca.

const VOIVODESHIPS = [
  "dolnośląskie", "kujawsko-pomorskie", "lubelskie", "lubuskie", "łódzkie", "małopolskie", "mazowieckie", "opolskie",
  "podkarpackie", "podlaskie", "pomorskie", "śląskie", "świętokrzyskie", "warmińsko-mazurskie", "wielkopolskie",
  "zachodniopomorskie",
];

/** Wycinek drzewa TERYT: województwo → powiat → gmina → miejscowość. */
const TERYT_TREE = {
  mazowieckie: { "Warszawa": { "Warszawa": ["Warszawa"] }, "otwocki": { "Otwock": ["Otwock"], "Józefów": ["Józefów"] } },
  małopolskie: { "Kraków": { "Kraków": ["Kraków"] }, "wielicki": { "Wieliczka": ["Wieliczka", "Raciborsko"] } },
  wielkopolskie: { "Poznań": { "Poznań": ["Poznań"] }, "poznański": { "Swarzędz": ["Swarzędz", "Kobylnica"] } },
};

const COUNTRIES = [
  "Polska", "Austria", "Belgia", "Czechy", "Dania", "Estonia", "Finlandia", "Francja", "Hiszpania", "Holandia",
  "Irlandia", "Litwa", "Łotwa", "Niemcy", "Norwegia", "Słowacja", "Szwecja", "Ukraina", "Wielka Brytania", "Włochy",
];

export const TERYT_LEVELS = ["Województwo", "Powiat", "Gmina", "Miejscowość"];

/** Nazwy słowników z materiałów COI (Hacknation – Słowniki) i ich opisy. */
const DICTIONARY_INFO = {
  Kraje: { label: "Kraje", values: COUNTRIES },
  TERYT_4G_DOWODOWY: { label: "TERYT (4 poziomy)", values: VOIVODESHIPS, tree: true },
  TERYT_DOWODOWY: { label: "TERYT", values: VOIVODESHIPS, tree: true },
};

export function dictionaryInfo(name) {
  if (!name) return null;
  return DICTIONARY_INFO[name] ?? { label: name, values: [], unknown: true };
}

export function dictionaryValues(name) {
  return dictionaryInfo(name)?.values ?? [];
}

/** Kolejny poziom drzewa TERYT dla wybranych wartości wyższych poziomów. */
export function terytChildren(selected) {
  let node = TERYT_TREE;
  for (const value of selected) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return [];
    node = node[value];
  }
  if (!node) return [];
  return Array.isArray(node) ? node : Object.keys(node);
}

/** Źródła danych inicjalnych (materiał „Dane inicjalne”). */
export const REGISTRY_SOURCES = {
  PESEL: "rejestru PESEL",
  PESEL_ADDRESS: "danych adresowych z rejestru PESEL",
  MLPZ: "profilu zalogowanego użytkownika",
};

export const REGISTRY_ATTRIBUTES = {
  PESEL: [
    "pesel", "name", "surname", "birthDate", "citizenship", "motherName", "birthPlace", "motherSurname", "sex",
    "fatherName", "secondName", "birthCountry", "foreignBirthUSC", "familyName", "fatherSurname", "maritalStatus",
  ],
  PESEL_ADDRESS: [
    "temporaryAddressVoivodeship", "temporaryAddressDistrict", "temporaryAddressCommunity", "temporaryAddressPlace",
    "temporaryAddressStreetType", "temporaryAddressStreet", "temporaryAddressHouseNumber",
    "temporaryAddressApartmentNumber", "temporaryAddressPostalCode", "permanentAddressVoivodeship",
    "permanentAddressDistrict", "permanentAddressCommunity", "permanentAddressPlace", "permanentAddressStreetType",
    "permanentAddressStreet", "permanentAddressPostalCode", "permanentAddressHouseNumber",
    "permanentAddressApartmentNumber",
  ],
  MLPZ: [
    "name", "secondName", "surname", "pesel", "phoneNumber", "email", "country", "voivodeship", "district", "community",
    "place", "postCode", "street", "building", "apartment", "institutionName", "descriptiveOrganizationName",
  ],
};

/** Fikcyjna osoba do podglądu (PESEL z poprawną sumą kontrolną). */
const SAMPLE_PERSON = {
  name: "Jan",
  surname: "Kowalski",
  secondName: "Piotr",
  pesel: "44051401458",
  phoneNumber: "600 100 200",
  email: "jan.kowalski@example.pl",
  country: "Polska",
  voivodeship: "mazowieckie",
  place: "Warszawa",
  postCode: "00-950",
  street: "Prosta",
  building: "12",
  apartment: "4",
  birthDate: "1944-05-14",
  citizenship: "polskie",
  permanentAddressPlace: "Warszawa",
  permanentAddressStreet: "Prosta",
  permanentAddressPostalCode: "00-950",
  permanentAddressHouseNumber: "12",
  permanentAddressApartmentNumber: "4",
};

/** "MLPZ.postCode" → { source: "MLPZ", attribute: "postCode" } albo null. */
export function parseRegistryRef(value) {
  if (typeof value !== "string") return null;
  const [source, attribute, ...rest] = value.split(".");
  if (!source || !attribute || rest.length) return null;
  return { source, attribute };
}

export function isKnownRegistryRef(value) {
  const ref = parseRegistryRef(value);
  return Boolean(ref && REGISTRY_ATTRIBUTES[ref.source]?.includes(ref.attribute));
}

export function resolveRegistryValue(value) {
  const ref = parseRegistryRef(value);
  if (!ref) return "";
  return SAMPLE_PERSON[ref.attribute] ?? "";
}

export function registrySourceLabel(value) {
  const ref = parseRegistryRef(value);
  return ref ? REGISTRY_SOURCES[ref.source] ?? ref.source : "";
}
