"""JSONata queries for `states` (visibility conditions), in the shape used by the reference outputs."""


def answer_path(page_title: str, section_tech_name: str, field_tech_name: str) -> str:
  """Path to the user's answer of a field: tabs[page].questions[section].field.repeatingSectionGrid[field]."""
  return (
    f"tabs['{page_title}' in title]"
    f".questions['{section_tech_name}' in field.techName]"
    f".field.repeatingSectionGrid['{field_tech_name}' in field.techName]"
    f".field.__userAnswer"
  )


def repeating_answer_path(page_title: str, section_tech_name: str, field_tech_name: str) -> str:
  """Answer of a field inside a repeating section, as in Reguły techniczne (current repetition only)."""
  return (
    f"tabs['{page_title}' in title]"
    f".questions['{section_tech_name}' in field.techName]"
    f".field.__userAnswer[$repeatingSectionIndex]['{field_tech_name}' in fieldTechName].answers"
  )


def equals(value: str, path: str) -> str:
  """`("Opcja" in <path>)`: true when the option is selected (works for RADIO, SELECT and CHECKBOX)."""
  escaped = value.replace("\\", "\\\\").replace('"', '\\"')
  return f'("{escaped}" in {path})'


def not_(expr: str) -> str:
  return f"$not{expr}" if expr.startswith("(") and expr.endswith(")") else f"$not({expr})"


def and_(*exprs: str) -> str:
  return _join("and", exprs)


def or_(*exprs: str) -> str:
  return _join("or", exprs)


def group(expr: str) -> str:
  return f"({expr})"


def _join(operator: str, exprs: tuple[str, ...]) -> str:
  parts = [e for e in exprs if e]
  return f" {operator} ".join(parts)


def show(query: str) -> list[dict]:
  """`states` list with a single SHOW rule; empty when there is no condition."""
  return [{"type": "SHOW", "query": query}] if query else []
