const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

function getErrorMessage(payload, fileName, status) {
  if (typeof payload?.message === "string") return payload.message;

  if (Array.isArray(payload?.detail) && payload.detail.length) {
    return payload.detail
      .map((item) => item?.msg)
      .filter(Boolean)
      .join("; ");
  }

  if (typeof payload?.detail === "string") return payload.detail;

  return `Nie udało się przesłać pliku „${fileName}” (HTTP ${status}).`;
}

async function postFile(path, file) {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON responses are handled by the status-specific fallback below.
  }

  if (!response.ok) {
    const message = getErrorMessage(payload, file.name, response.status);
    const error = new Error(message);
    error.code = payload?.code;
    error.status = response.status;
    throw error;
  }

  return payload;
}

export async function convertFormFile(file) {
  const payload = await postFile("/forms/convert", file);

  if (!payload?.form) {
    throw new Error(`Backend zwrócił niepoprawną odpowiedź dla pliku „${file.name}”.`);
  }

  return payload;
}

/** Text the backend read from the file (no AI): `{format, blocks: [{kind, text, checked, rows, page}]}`. */
export async function extractFormFile(file) {
  const payload = await postFile("/forms/extract", file);

  if (!Array.isArray(payload?.blocks)) {
    throw new Error(`Backend zwrócił niepoprawny odczyt pliku „${file.name}”.`);
  }

  return payload;
}
