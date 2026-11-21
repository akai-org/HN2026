// Trzy kolumny (Oryginał / Formularz / JSON): włączanie, przestawianie jak karty i zmiana szerokości.
// Wszystko działa też z klawiatury: przyciski „w lewo / w prawo” i uchwyty sterowane strzałkami.
import { useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, GripVertical, RotateCcw, X } from "lucide-react";
import { IconButton } from "../components/primitives.jsx";
import { COLUMN_LABELS, MIN_WIDTH, visibleWidths } from "./useColumns.js";

const DRAG_TYPE = "application/x-kv-column";

function hasColumnDrag(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes(DRAG_TYPE);
}

/** Wybór kolumn (zwarty, do paska nad kolumnami): włączanie i przestawianie przeciąganiem. */
export function ColumnsChips({ layout, toggle, move, reset }) {
  const [dragOver, setDragOver] = useState(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <fieldset className="flex flex-wrap items-center gap-1.5" title="Przeciągnij kolumnę, aby zmienić kolejność. Krawędź między kolumnami zmienia ich szerokość.">
        <legend className="float-left mr-1 text-sm font-semibold text-slate-800">Kolumny:</legend>
        {layout.order.map((id) => {
          const checked = layout.visible[id];
          return (
            <label
              key={id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_TYPE, id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (!hasColumnDrag(event)) return;
                event.preventDefault();
                setDragOver(id);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(event) => {
                const source = event.dataTransfer.getData(DRAG_TYPE);
                setDragOver(null);
                if (source && source !== id) move(source, { targetId: id });
              }}
              className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-2 px-2.5 text-sm font-semibold transition select-none has-focus-visible:outline-3 has-focus-visible:outline-(--kv-focus) ${
                checked ? "border-(--blue) bg-(--blue-soft) text-(--blue)" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              } ${dragOver === id ? "ring-4 ring-(--blue-ring)" : ""}`}
            >
              <GripVertical aria-hidden="true" size={14} className="-ml-1 cursor-grab text-slate-500" />
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(id)} />
              <span
                aria-hidden="true"
                className={`flex size-4 items-center justify-center rounded border-2 ${checked ? "border-(--blue) bg-(--blue) text-white" : "border-slate-400 bg-white"}`}
              >
                {checked && <Check size={11} strokeWidth={3.5} />}
              </span>
              {COLUMN_LABELS[id]}
            </label>
          );
        })}
      </fieldset>
      <IconButton label="Przywróć układ kolumn" icon={RotateCcw} size={16} onClick={reset} />
    </div>
  );
}

function Separator({ leftId, rightId, leftPercent, containerRef, onResize }) {
  const start = useRef(null);
  const label = `Szerokość kolumn ${COLUMN_LABELS[leftId]} i ${COLUMN_LABELS[rightId]}`;

  function onPointerDown(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width: containerRef.current?.getBoundingClientRect().width ?? 1 };
  }
  function onPointerMove(event) {
    if (!start.current) return;
    const deltaPercent = ((event.clientX - start.current.x) / start.current.width) * 100;
    if (Math.abs(deltaPercent) < 0.2) return;
    start.current.x = event.clientX;
    onResize(leftId, rightId, deltaPercent);
  }
  function onPointerUp() {
    start.current = null;
  }
  function onKeyDown(event) {
    const step = event.shiftKey ? 10 : 2;
    const map = { ArrowLeft: -step, ArrowRight: step, Home: -100, End: 100 };
    if (map[event.key] === undefined) return;
    event.preventDefault();
    onResize(leftId, rightId, map[event.key]);
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(leftPercent)}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={100 - MIN_WIDTH}
      title={`${label} (strzałki w lewo i w prawo)`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className="group relative z-10 flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center rounded-full"
    >
      <span className="h-16 w-1 rounded-full bg-slate-300 transition-colors group-hover:bg-(--blue) group-focus-visible:bg-(--blue)" />
    </div>
  );
}

function PanelHeader({ id, title, subtitle, titleId, isWide, canMoveLeft, canMoveRight, onMove, onHide, canHide, actions }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      {isWide && (
        <span
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(DRAG_TYPE, id);
            event.dataTransfer.effectAllowed = "move";
          }}
          aria-hidden="true"
          title="Przeciągnij, aby przestawić kolumnę"
          className="flex h-9 w-5 cursor-grab items-center justify-center rounded text-slate-500 hover:bg-slate-100 active:cursor-grabbing"
        >
          <GripVertical size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="truncate text-[15px] font-bold text-slate-900">
          {title}
        </h2>
        {subtitle && <p className="truncate text-xs text-slate-600">{subtitle}</p>}
      </div>
      {actions}
      {isWide && (
        <span className="flex items-center">
          <IconButton label={`Przesuń kolumnę ${title} w lewo`} icon={ArrowLeft} size={16} disabled={!canMoveLeft} onClick={() => onMove(id, { delta: -1 })} />
          <IconButton label={`Przesuń kolumnę ${title} w prawo`} icon={ArrowRight} size={16} disabled={!canMoveRight} onClick={() => onMove(id, { delta: 1 })} />
          {canHide && <IconButton label={`Ukryj kolumnę ${title}`} icon={X} size={16} onClick={() => onHide(id)} />}
        </span>
      )}
    </div>
  );
}

/**
 * panels: { [id]: { title, subtitle, actions, body } }
 * Na szerokim ekranie kolumny stoją obok siebie, na wąskim przełącza się je zakładkami (wzorzec ARIA tabs).
 */
export function Columns({ layout, move, toggle, resize, panels, isWide, mobileTab, onMobileTab }) {
  const containerRef = useRef(null);
  const baseId = useId();
  const [dropTarget, setDropTarget] = useState(null);
  const shares = visibleWidths(layout);
  const visibleIds = shares.map((entry) => entry.id);

  if (!isWide) {
    const active = mobileTab ?? visibleIds[0] ?? "form";
    const ids = layout.order;
    const onKeyDown = (event) => {
      const index = ids.indexOf(active);
      const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ids.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const id = ids[(next + ids.length) % ids.length];
      onMobileTab(id);
      document.getElementById(`${baseId}-tab-${id}`)?.focus();
    };
    const panel = panels[active];
    return (
      <div className="flex min-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div role="tablist" aria-label="Widok" onKeyDown={onKeyDown} className="flex border-b border-slate-200 bg-slate-50 p-1.5">
          {ids.map((id) => (
            <button
              key={id}
              id={`${baseId}-tab-${id}`}
              role="tab"
              type="button"
              aria-selected={id === active}
              aria-controls={`${baseId}-panel`}
              tabIndex={id === active ? 0 : -1}
              onClick={() => onMobileTab(id)}
              className={`h-10 flex-1 rounded-xl text-sm font-semibold transition ${id === active ? "bg-white text-(--blue) shadow-sm ring-1 ring-slate-200" : "text-slate-700 hover:text-slate-900"}`}
            >
              {COLUMN_LABELS[id]}
            </button>
          ))}
        </div>
        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`} className="flex min-h-0 flex-1 flex-col">
          <PanelHeader id={active} title={panel.title} subtitle={panel.subtitle} titleId={`${baseId}-title-${active}`} isWide={false} actions={panel.actions} />
          <div className="flex min-h-0 flex-1 flex-col">{panel.body}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex min-h-[420px] flex-1 items-stretch">
      {shares.map(({ id, percent }, index) => {
        const panel = panels[id];
        const titleId = `${baseId}-title-${id}`;
        return (
          <div key={id} className="contents">
            {index > 0 && (
              <Separator
                leftId={shares[index - 1].id}
                rightId={id}
                leftPercent={(shares[index - 1].percent / (shares[index - 1].percent + percent)) * 100}
                containerRef={containerRef}
                onResize={resize}
              />
            )}
            <section
              aria-labelledby={titleId}
              style={{ flexBasis: `${percent}%` }}
              onDragOver={(event) => {
                if (!hasColumnDrag(event)) return;
                event.preventDefault();
                setDropTarget(id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null);
              }}
              onDrop={(event) => {
                const source = event.dataTransfer.getData(DRAG_TYPE);
                setDropTarget(null);
                if (source && source !== id) move(source, { targetId: id });
              }}
              className={`flex min-w-0 grow-0 shrink flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                dropTarget === id ? "border-(--blue) ring-4 ring-(--blue-ring)" : "border-slate-200"
              }`}
            >
              <PanelHeader
                id={id}
                title={panel.title}
                subtitle={panel.subtitle}
                titleId={titleId}
                isWide
                canMoveLeft={index > 0}
                canMoveRight={index < shares.length - 1}
                onMove={move}
                onHide={toggle}
                canHide={shares.length > 1}
                actions={panel.actions}
              />
              <div className="flex min-h-0 flex-1 flex-col">{panel.body}</div>
            </section>
          </div>
        );
      })}
    </div>
  );
}
