// Uploaded files kept in memory, so the verify step can show the original next to the digital form.
// Conversion results refer to their file by id: the results are also saved in sessionStorage, which cannot
// hold files. After a page reload the store is empty and the comparison asks to add the file again.

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

/** Drops the files of earlier conversions, keeping only the given ids. */
export function keepOnly(ids) {
  const wanted = new Set(ids);
  for (const [id, file] of files) {
    if (wanted.has(id)) continue;
    if (objectUrls.has(file)) URL.revokeObjectURL(objectUrls.get(file));
    files.delete(id);
  }
}
