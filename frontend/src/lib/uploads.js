// The list of uploaded files: what the backend accepts and how consecutive files are grouped into forms.

export const ACCEPTED_FILE_TYPES = ".pdf,.doc,.docx,.ods,.xlsx,.jpg,.jpeg,.png";
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Lower-case extension without the dot, or "" when the name has none. */
export function fileExtension(name = "") {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function formatFileSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

/**
 * Forms as groups of files (upload step) → the flat list and form boundaries the next steps use:
 * `files` in group order, `splitBefore` = indexes of the files that start a new form (never 0).
 */
export function flattenGroups(groups) {
  const files = groups.flatMap((group) => group.files);
  const splitBefore = [];
  let index = 0;
  for (const group of groups) {
    if (index > 0) splitBefore.push(index);
    index += group.files.length;
  }
  return { files, splitBefore };
}

/** Number of the form (from 1) that the file at `index` belongs to; `splitBefore` holds the indexes that start a new form. */
export function formNumberAt(index, splitBefore) {
  return 1 + [...splitBefore].filter((split) => split <= index).length;
}
