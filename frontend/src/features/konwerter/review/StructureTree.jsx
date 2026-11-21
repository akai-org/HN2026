// Uproszczony widok JSON-a: drzewo strona → sekcja → pole (wzorzec ARIA tree).
// Pokazuje to, co w JSON-ie najważniejsze, bez nawiasów i identyfikatorów.
import { useEffect, useMemo, useRef, useState } from "react";
import { Asterisk, ChevronRight, Database, FileText, GitBranch, Layers } from "lucide-react";
import { asArray, childQuestions, isAutoFilled, isRequired, orderedIndexes, tabsInOrder, typeLabel } from "../lib/formModel.js";
import { htmlToText } from "../lib/html.js";
import { scrollWithin } from "../lib/scroll.js";
import { fieldIcon } from "./fieldIcons.js";

function questionNodes(questions, parentKey) {
  return orderedIndexes(questions).map((index) => {
    const field = questions[index]?.field ?? {};
    const children = childQuestions(field);
    const text = field.title?.trim() || (field.description ? htmlToText(field.description).slice(0, 70) : "") || field.techName || "Pole bez nazwy";
    return {
      key: field.id ?? `${parentKey}-${index}`,
      fieldId: field.id,
      label: text,
      type: field.type,
      techName: field.techName,
      required: isRequired(field),
      auto: isAutoFilled(field),
      conditional: asArray(field.states).length > 0,
      children: children.length ? questionNodes(children, field.id ?? `${parentKey}-${index}`) : null,
    };
  });
}

function buildTree(form) {
  return tabsInOrder(form).map(({ tab, index }) => ({
    key: `tab-${index}`,
    tabIndex: index,
    label: tab.title || `Strona ${index + 1}`,
    kind: tab.type === "FINISH" ? "finish" : "tab",
    children: questionNodes(asArray(tab.questions), `tab-${index}`),
  }));
}

function flatten(nodes, expanded, level = 1, parent = null, out = []) {
  nodes.forEach((node, index) => {
    out.push({ node, level, parent, posinset: index + 1, setsize: nodes.length });
    if (node.children && expanded.has(node.key)) flatten(node.children, expanded, level + 1, node.key, out);
  });
  return out;
}

function allKeys(nodes, out = new Set()) {
  for (const node of nodes) {
    if (node.children) {
      out.add(node.key);
      allKeys(node.children, out);
    }
  }
  return out;
}

function ancestorsOf(nodes, key, trail = []) {
  for (const node of nodes) {
    if (node.key === key) return trail;
    if (node.children) {
      const found = ancestorsOf(node.children, key, [...trail, node.key]);
      if (found) return found;
    }
  }
  return null;
}

export default function StructureTree({ form, selectedId, onSelect, states }) {
  const nodes = useMemo(() => buildTree(form), [form]);
  const [collapsed, setCollapsed] = useState(() => new Set());
  // Rozwinięte jest wszystko poza tym, co urzędnik zwinął; rodzice zaznaczonego pola są zawsze otwarte.
  const forced = useMemo(() => new Set(selectedId ? ancestorsOf(nodes, selectedId) ?? [] : []), [nodes, selectedId]);
  const expanded = useMemo(() => {
    const open = allKeys(nodes);
    for (const key of collapsed) if (!forced.has(key)) open.delete(key);
    return open;
  }, [nodes, collapsed, forced]);
  // Fokus „wędruje” po drzewie; po nowym zaznaczeniu z zewnątrz wraca na zaznaczone pole.
  const [focus, setFocus] = useState({ key: null, selectedId: null });
  const treeRef = useRef(null);
  const scrollRef = useRef(null);
  const rows = flatten(nodes, expanded);
  const selectedKey = selectedId && rows.find((row) => row.node.fieldId === selectedId)?.node.key;
  const focusValid = focus.selectedId === selectedId && rows.some((row) => row.node.key === focus.key);
  const activeKey = (focusValid ? focus.key : selectedKey) || rows[0]?.node.key;
  const setFocusedKey = (key) => setFocus({ key, selectedId });

  // Zaznaczenie z podglądu albo z JSON-a: przewiń drzewo do pola (bez przewijania strony).
  useEffect(() => {
    if (!selectedId) return undefined;
    const frame = requestAnimationFrame(() => {
      scrollWithin(scrollRef.current, treeRef.current?.querySelector(`[data-key="${CSS.escape(selectedId)}"]`));
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId]);

  function focusRow(key) {
    setFocusedKey(key);
    requestAnimationFrame(() => {
      const element = treeRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`);
      element?.focus({ preventScroll: true });
      scrollWithin(scrollRef.current, element);
    });
  }

  function toggle(key, open) {
    setCollapsed((current) => {
      const next = new Set(current);
      const shouldOpen = open ?? !expanded.has(key);
      if (shouldOpen) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function activate(node) {
    if (node.fieldId) onSelect(node.fieldId);
    else if (node.children) toggle(node.key);
  }

  function onKeyDown(event, row) {
    const index = rows.indexOf(row);
    const { node } = row;
    switch (event.key) {
      case "ArrowDown":
        if (rows[index + 1]) focusRow(rows[index + 1].node.key);
        break;
      case "ArrowUp":
        if (rows[index - 1]) focusRow(rows[index - 1].node.key);
        break;
      case "ArrowRight":
        if (node.children && !expanded.has(node.key)) toggle(node.key, true);
        else if (node.children && rows[index + 1]) focusRow(rows[index + 1].node.key);
        break;
      case "ArrowLeft":
        if (node.children && expanded.has(node.key)) toggle(node.key, false);
        else if (row.parent) focusRow(row.parent);
        break;
      case "Home":
        focusRow(rows[0].node.key);
        break;
      case "End":
        focusRow(rows[rows.length - 1].node.key);
        break;
      case "Enter":
      case " ":
        activate(node);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div ref={scrollRef} className="kv-scroll h-full overflow-auto p-2">
      <ul ref={treeRef} role="tree" aria-label="Struktura formularza: strony, sekcje i pola" className="text-sm">
        {rows.map((row) => {
          const { node, level } = row;
          const Icon = node.kind === "tab" ? Layers : node.kind === "finish" ? FileText : fieldIcon(node.type);
          const selected = Boolean(node.fieldId) && node.fieldId === selectedId;
          const hidden = node.fieldId && states?.[node.fieldId] && !states[node.fieldId].visible;
          return (
            <li
              key={node.key}
              data-key={node.key}
              role="treeitem"
              aria-level={level}
              aria-posinset={row.posinset}
              aria-setsize={row.setsize}
              aria-expanded={node.children ? expanded.has(node.key) : undefined}
              aria-selected={selected}
              tabIndex={node.key === activeKey ? 0 : -1}
              onKeyDown={(event) => onKeyDown(event, row)}
              onClick={() => {
                setFocusedKey(node.key);
                activate(node);
              }}
              onFocus={() => setFocusedKey(node.key)}
              style={{ paddingLeft: `${(level - 1) * 18 + 4}px` }}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-2 ${
                selected ? "bg-(--kv-highlight) shadow-[inset_3px_0_0_var(--kv-highlight-edge)]" : "hover:bg-slate-50"
              } ${level === 1 ? "mt-1 font-bold text-slate-900" : "text-slate-800"}`}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">
                {node.children && (
                  <ChevronRight
                    aria-hidden="true"
                    size={15}
                    className={`text-slate-500 transition-transform ${expanded.has(node.key) ? "rotate-90" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(node.key);
                    }}
                  />
                )}
              </span>
              <Icon aria-hidden="true" size={15} className={level === 1 ? "text-(--blue)" : "text-slate-500"} />
              <span className={`min-w-0 truncate ${hidden ? "text-slate-500 italic" : ""}`}>{node.label}</span>
              {node.type && <span className="sr-only">, {typeLabel(node.type)}</span>}
              {node.techName && (
                <code aria-hidden="true" className="ml-1 hidden truncate rounded bg-slate-100 px-1 font-mono text-[11px] text-slate-600 2xl:inline">
                  {node.techName}
                </code>
              )}
              <span className="ml-auto flex shrink-0 items-center gap-1 pl-1">
                {node.required && (
                  <span title="Pole obowiązkowe" className="text-red-700">
                    <Asterisk aria-hidden="true" size={13} />
                    <span className="sr-only">, obowiązkowe</span>
                  </span>
                )}
                {node.auto && (
                  <span title="Uzupełnia się z rejestru" className="text-emerald-700">
                    <Database aria-hidden="true" size={13} />
                    <span className="sr-only">, z rejestru</span>
                  </span>
                )}
                {node.conditional && (
                  <span title="Pole z warunkiem" className="text-violet-700">
                    <GitBranch aria-hidden="true" size={13} />
                    <span className="sr-only">, z warunkiem{hidden ? ", teraz ukryte" : ""}</span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
