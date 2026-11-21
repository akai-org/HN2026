// Klient REST API backendu (FastAPI). Kontrakt: docs/bloki/G-api-pipeline.md
//   POST /api/forms/convert  (multipart, pole "file") → { form: FormDefinition, warnings: string[] }
//   GET  /api/health         → { status: "ok", llm: "ok" | "unavailable" }
// Jeśli backend kiedyś dołoży PDF oryginału (np. po konwersji z Worda), odczytamy go z pól
// `pdf` / `pdf_base64` (base64) albo `pdf_url` (adres). Bez nich podgląd korzysta z pliku z przeglądarki.

export const CONVERT_URL = "/api/forms/convert";
export const HEALTH_URL = "/api/health";

/** Komunikaty dla kodów błędów z backendu (AppError.code), gdy serwer nie poda własnego. */
const ERROR_MESSAGES = {
  FILE_TOO_LARGE: "Plik jest za duży.",
  UNSUPPORTED_FORMAT: "Ten format pliku nie jest obsługiwany.",
  MIME_MISMATCH: "Zawartość pliku nie pasuje do jego rozszerzenia. Zapisz plik ponownie we właściwym formacie.",
  INVALID_FILENAME: "Nazwa pliku jest nieprawidłowa.",
};

export class ApiError extends Error {
  constructor(message, { status = 0, code = "" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function warningText(warning) {
  if (typeof warning === "string") return warning;
  if (warning && typeof warning.message === "string") return warning.message;
  return JSON.stringify(warning);
}

/** Ujednolica odpowiedź: przyjmuje { form, warnings } albo sam FormDefinition. */
export function normalizeResult(data) {
  if (!data || typeof data !== "object") throw new ApiError("Serwer zwrócił pustą odpowiedź.");
  const form = data.form && typeof data.form === "object" ? data.form : Array.isArray(data.tabs) ? data : null;
  if (!form) throw new ApiError("Odpowiedź serwera nie zawiera formularza.");
  const warnings = Array.isArray(data.warnings) ? data.warnings.map(warningText) : [];
  const base64 = data.pdf ?? data.pdf_base64 ?? data.preview_pdf ?? null;
  const url = data.pdf_url ?? data.preview_url ?? null;
  const sourcePdf = typeof base64 === "string" && base64 ? { base64 } : typeof url === "string" && url ? { url } : null;
  return { form, warnings, sourcePdf };
}

/** Zamienia base64 (także w postaci data:...) na Blob PDF. */
export function base64ToPdfBlob(base64) {
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

async function errorFromResponse(response) {
  let message = "";
  let code = "";
  try {
    const data = await response.json();
    code = typeof data?.code === "string" ? data.code : "";
    if (typeof data?.message === "string") message = data.message;
    else if (Array.isArray(data?.detail)) message = data.detail.map((d) => d?.msg).filter(Boolean).join(" ");
    else if (typeof data?.detail === "string") message = data.detail;
  } catch {
    // Serwer nie zwrócił JSON-a: zostaje komunikat domyślny.
  }
  if (!message) message = ERROR_MESSAGES[code] ?? "";
  if (!message) {
    message =
      response.status >= 500
        ? `Serwer nie poradził sobie z tym plikiem (błąd ${response.status}). Spróbuj ponownie za chwilę.`
        : `Nie udało się rozpoznać formularza (błąd ${response.status}).`;
  }
  return new ApiError(message, { status: response.status, code });
}

/**
 * Wysyła plik do rozpoznania.
 * @returns {Promise<{ form: object, warnings: string[], sourcePdf: null | { base64?: string, url?: string } }>}
 */
export async function convertFile(file, { signal, fetchImpl = fetch } = {}) {
  const body = new FormData();
  body.append("file", file, file.name);

  let response;
  try {
    response = await fetchImpl(CONVERT_URL, { method: "POST", body, signal });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("Brak połączenia z serwerem. Sprawdź, czy aplikacja działa, i spróbuj ponownie.");
  }
  if (!response.ok) throw await errorFromResponse(response);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError("Serwer zwrócił odpowiedź, której nie da się odczytać.");
  }
  return normalizeResult(data);
}

/** Stan usługi: "ok" | "llm-unavailable" | "offline". */
export async function checkHealth({ signal, fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(HEALTH_URL, { signal });
    if (!response.ok) return "offline";
    const data = await response.json();
    return data?.llm === "ok" ? "ok" : "llm-unavailable";
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return "offline";
  }
}
