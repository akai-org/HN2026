// Przewijanie elementu w obrębie jego kontenera (bez przewijania całej strony, jak robi scrollIntoView).

function prefersReducedMotion() {
  return (
    document.documentElement.classList.contains("kv-reduce-motion") ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** block: "center" ustawia element na środku kontenera, "nearest" przewija tylko, gdy wystaje. */
export function scrollWithin(container, element, block = "nearest") {
  if (!container || !element) return;
  const box = container.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const offset = rect.top - box.top + container.scrollTop;
  let target = container.scrollTop;
  if (block === "center") {
    target = offset - (container.clientHeight - Math.min(rect.height, container.clientHeight)) / 2;
  } else if (rect.top < box.top) {
    target = offset - 8;
  } else if (rect.bottom > box.bottom) {
    target = offset + rect.height - container.clientHeight + 8;
  }
  container.scrollTo({ top: Math.max(0, target), behavior: prefersReducedMotion() ? "auto" : "smooth" });
}
