// Uploaded files kept in memory between pages, so "Sprawdź i zatwierdź" can show the original next to the
// digital form. Router state carries only the id: files never go to history state or browser storage.
// After a page reload the store is empty and the comparison asks to add the file again.

const files = new Map();
const objectUrls = new WeakMap();
let nextId = 1;

export function keepFile(file) {
  const id = `plik-${nextId++}`;
  files.set(id, file);
  return id;
}

export function getFile(id) {
  return (id && files.get(id)) || null;
}

/** `blob:` URL of a kept file for <iframe>/<img>; created once and revoked when the file is dropped. */
export function fileUrl(file) {
  if (!objectUrls.has(file)) objectUrls.set(file, URL.createObjectURL(file));
  return objectUrls.get(file);
}

/** Drops files of earlier conversions, keeping only the given ids. */
export function keepOnly(ids) {
  const wanted = new Set(ids);
  for (const [id, file] of files) {
    if (wanted.has(id)) continue;
    if (objectUrls.has(file)) URL.revokeObjectURL(objectUrls.get(file));
    files.delete(id);
  }
}
