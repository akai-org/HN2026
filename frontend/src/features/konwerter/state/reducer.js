// Stan konwertera: pliki (items), formularze (groups) i ich wyniki.
// Reducer jest czysty (StrictMode wywołuje go dwa razy), identyfikatory grup liczy z `seq` w stanie.
import { applyForm, applyText, createDoc, redo, undo } from "../lib/doc.js";
import {
  addEntries,
  createGroup,
  isEditable,
  mergeAll,
  mergeWithPrevious,
  moveItem,
  removeItem,
  renameGroup,
  splitAll,
  splitAt,
} from "../lib/grouping.js";

export const initialState = { items: {}, groups: [], rejected: [], seq: 0 };

function idMaker(state) {
  let seq = state.seq;
  return {
    makeId: () => `f${++seq}`,
    seq: () => seq,
  };
}

function updateGroup(state, groupId, patch) {
  return {
    ...state,
    groups: state.groups.map((group) =>
      group.id === groupId ? { ...group, ...(typeof patch === "function" ? patch(group) : patch) } : group,
    ),
  };
}

function withGroups(state, fn) {
  const ids = idMaker(state);
  const groups = fn(state.groups, ids.makeId);
  return { ...state, groups, seq: ids.seq() };
}

function dropOrphanItems(state) {
  const used = new Set(state.groups.flatMap((group) => group.itemIds));
  const items = Object.fromEntries(Object.entries(state.items).filter(([id]) => used.has(id)));
  return { ...state, items };
}

export function reducer(state, action) {
  switch (action.type) {
    case "ADD_ITEMS": {
      const items = { ...state.items };
      for (const item of action.items) items[item.id] = item;
      const next = { ...state, items, rejected: action.rejected ?? [] };
      return withGroups(next, (groups, makeId) => addEntries(groups, action.items, items, makeId));
    }
    case "DISMISS_REJECTED":
      return { ...state, rejected: [] };

    case "REMOVE_ITEM":
      return dropOrphanItems(withGroups(state, (groups) => removeItem(groups, action.itemId, state.items)));
    case "REMOVE_GROUP":
      return dropOrphanItems({ ...state, groups: state.groups.filter((group) => group.id !== action.groupId) });
    case "CLEAR":
      return { ...initialState, seq: state.seq };

    case "SPLIT":
      return withGroups(state, (groups, makeId) => splitAt(groups, action.groupId, action.itemId, state.items, makeId));
    case "MERGE_PREV":
      return withGroups(state, (groups) => mergeWithPrevious(groups, action.groupId, state.items));
    case "MOVE_ITEM":
      return withGroups(state, (groups) => moveItem(groups, action.itemId, action.delta, state.items));
    case "MERGE_ALL":
      return withGroups(state, (groups) => mergeAll(groups, state.items));
    case "SPLIT_ALL":
      return withGroups(state, (groups, makeId) => splitAll(groups, state.items, makeId));
    case "RENAME":
      return { ...state, groups: renameGroup(state.groups, action.groupId, action.name) };

    case "QUEUE": {
      const ids = new Set(action.groupIds);
      return {
        ...state,
        groups: state.groups.map((group) =>
          ids.has(group.id) && isEditable(group) ? { ...group, status: "queued", error: "" } : group,
        ),
      };
    }
    case "START":
      return updateGroup(state, action.groupId, { status: "processing", startedAt: action.at, error: "" });
    case "SOURCE":
      return updateGroup(state, action.groupId, { source: action.source });
    case "SUCCESS":
      return updateGroup(state, action.groupId, (group) => ({
        status: "done",
        finishedAt: action.at,
        result: action.result,
        doc: createDoc(action.result.form),
        source: action.source ?? group.source,
        approved: false,
      }));
    case "FAIL":
      return updateGroup(state, action.groupId, { status: "error", error: action.error, finishedAt: action.at });
    case "CANCEL": {
      const ids = new Set(action.groupIds);
      return {
        ...state,
        groups: state.groups.map((group) =>
          ids.has(group.id) && (group.status === "queued" || group.status === "processing")
            ? { ...group, status: "ready", startedAt: 0 }
            : group,
        ),
      };
    }

    case "ADD_DONE_GROUP": {
      const ids = idMaker(state);
      const group = createGroup(action.id ?? ids.makeId(), {
        name: action.name,
        nameEdited: true,
        origin: action.origin,
        status: "done",
        result: action.result,
        doc: createDoc(action.result.form),
        source: action.source ?? null,
        finishedAt: action.at,
      });
      return { ...state, groups: [...state.groups, group], seq: ids.seq() };
    }

    case "DOC_TEXT":
      return updateGroup(state, action.groupId, (group) => (group.doc ? { doc: applyText(group.doc, action.text, action.at), approved: false } : {}));
    case "DOC_FORM":
      return updateGroup(state, action.groupId, (group) => (group.doc ? { doc: applyForm(group.doc, action.form, action.at), approved: false } : {}));
    case "DOC_UNDO":
      return updateGroup(state, action.groupId, (group) => (group.doc ? { doc: undo(group.doc) } : {}));
    case "DOC_REDO":
      return updateGroup(state, action.groupId, (group) => (group.doc ? { doc: redo(group.doc) } : {}));
    case "APPROVE":
      return updateGroup(state, action.groupId, { approved: action.approved });

    default:
      throw new Error(`Nieznana akcja: ${action.type}`);
  }
}
