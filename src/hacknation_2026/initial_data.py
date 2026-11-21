"""Initial data sources (Dane inicjalne) shared by the builder (block D) and the rule check (block F).

A field fed from a register has `defaultValue: "SOURCE.attribute"`, `defaultValueType: EXTERNAL_SYSTEM` and is
read-only. Domain experts allow exceptions for attributes that may be outdated in the source: those may be edited by
the user (`readOnly: false`). Change EDITABLE_INITIAL_DATA to change which ones.
"""

EXTERNAL_SYSTEM = "EXTERNAL_SYSTEM"

# Dane inicjalne: sources and their attributes
INITIAL_DATA: dict[str, frozenset[str]] = {
  "PESEL": frozenset({
    "pesel", "name", "surname", "birthDate", "citizenship", "motherName", "birthPlace", "motherSurname", "sex",
    "fatherName", "secondName", "birthCountry", "foreignBirthUSC", "familyName", "fatherSurname", "maritalStatus",
  }),
  "PESEL_ADDRESS": frozenset(
    f"{kind}Address{part}"
    for kind in ("temporary", "permanent")
    for part in (
      "Voivodeship", "District", "Community", "Place", "StreetType", "Street",
      "HouseNumber", "ApartmentNumber", "PostalCode",
    )
  ),
  "MLPZ": frozenset({
    "name", "secondName", "surname", "pesel", "phoneNumber", "email", "country", "voivodeship", "district",
    "community", "place", "postCode", "street", "building", "apartment", "institutionName",
    "descriptiveOrganizationName",
  }),
}

# domain experts: register -> attributes that may be outdated there, so the user may correct them
EDITABLE_INITIAL_DATA: dict[str, frozenset[str]] = {
  "MLPZ": frozenset({"phoneNumber", "email"}),
}


def split(default_value: str) -> tuple[str, str]:
  """'MLPZ.email' -> ('MLPZ', 'email')."""
  source, _, attribute = default_value.partition(".")
  return source, attribute


def is_known(default_value: str) -> bool:
  source, attribute = split(default_value)
  return attribute in INITIAL_DATA.get(source, frozenset())


def is_editable(default_value: str) -> bool:
  """True when the register attribute may be edited by the user (readOnly false); otherwise it must be read-only."""
  source, attribute = split(default_value)
  return attribute in EDITABLE_INITIAL_DATA.get(source, frozenset())
