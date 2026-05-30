import { useState, useRef, useEffect } from "react";
import { useStore } from "../state/store";
import type { Slot } from "../model/types";
import { controlDisplayName } from "../model/controlName";
import { isStructuralSlot } from "../model/structural";
import SidebarMenus from "./SidebarMenus";

type DropPosition = "before" | "after" | "inside";

interface DropTarget {
  slotId: string;
  pos: DropPosition;
}

export default function HierarchyTree() {
  const root = useStore((s) => s.root);
  const hidden = useStore((s) => s.leftPanelHidden);
  const toggle = useStore((s) => s.toggleLeftPanel);
  const collapseAll = useStore((s) => s.collapseAll);
  const expandAll = useStore((s) => s.expandAll);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const draggingRef = useRef<string | null>(null);

  if (hidden) {
    return (
      <button
        onClick={toggle}
        title="Show Hierarchy panel"
        className="flex h-full w-6 items-center justify-center border-r border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-sky-300"
      >
        <span className="text-xs">▶</span>
      </button>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Hierarchy
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={expandAll}
            title="Expand all"
            className="rounded px-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            ⊞
          </button>
          <button
            onClick={collapseAll}
            title="Collapse all"
            className="rounded px-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            ⊟
          </button>
          <button
            onClick={toggle}
            title="Hide panel"
            className="ml-1 rounded px-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            ◀
          </button>
        </div>
      </div>
      <div
        className="scroll-thin flex-1 min-h-0 overflow-y-auto px-1 py-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          draggingRef.current = null;
          setDropTarget(null);
        }}
      >
        <SlotNode
          slot={root}
          depth={0}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          draggingRef={draggingRef}
        />
      </div>
      <SidebarMenus />
    </div>
  );
}

interface SlotNodeProps {
  slot: Slot;
  depth: number;
  dropTarget: DropTarget | null;
  setDropTarget: (t: DropTarget | null) => void;
  draggingRef: React.MutableRefObject<string | null>;
}

function SlotNode({ slot, depth, dropTarget, setDropTarget, draggingRef }: SlotNodeProps) {
  const selected = useStore((s) => s.selectedSlotId === slot.id);
  const collapsed = useStore((s) => !!s.collapsed[slot.id]);
  const select = useStore((s) => s.select);
  const addChild = useStore((s) => s.addChild);
  const remove = useStore((s) => s.remove);
  const duplicate = useStore((s) => s.duplicate);
  const rename = useStore((s) => s.rename);
  const toggleLock = useStore((s) => s.toggleSlotLock);
  const toggleCollapsed = useStore((s) => s.toggleCollapsed);
  const reparent = useStore((s) => s.reparent);
  const openContextMenu = useStore((s) => s.openContextMenu);
  const renamingSlotId = useStore((s) => s.renamingSlotId);
  const clearRenaming = useStore((s) => s.clearRenaming);
  const root = useStore((s) => s.root);
  const isRoot = depth === 0;
  const locked = !!slot.locked;
  // Visible children exclude hidden structural backdrop slots (see filter below).
  const hasChildren = slot.children.some((c) => !isStructuralSlot(c));
  // The default name shown everywhere: a labelled composite's auto "<label>
  // <type>" (e.g. "Volume Slider"), or the slot's own name once the user has
  // renamed it (a custom name takes the slot out of the auto set, so it wins).
  const displayName = controlDisplayName(slot);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayName);

  // The context-menu "Rename" action sets renamingSlotId; the matching row opens
  // its inline editor (seeded with the shown name) and clears the flag. This is
  // the same editor double-click uses.
  useEffect(() => {
    if (renamingSlotId !== slot.id) return;
    setEditValue(displayName);
    setEditing(true);
    clearRenaming();
  }, [renamingSlotId, slot.id, displayName, clearRenaming]);

  const isDropBefore = dropTarget?.slotId === slot.id && dropTarget.pos === "before";
  const isDropAfter = dropTarget?.slotId === slot.id && dropTarget.pos === "after";
  const isDropInside = dropTarget?.slotId === slot.id && dropTarget.pos === "inside";

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const draggingId = draggingRef.current;
    if (!draggingId || draggingId === slot.id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    let pos: DropPosition;
    if (isRoot) {
      // Root only accepts "inside" drops
      pos = "inside";
    } else if (y < h * 0.25) {
      pos = "before";
    } else if (y > h * 0.75) {
      pos = "after";
    } else {
      pos = "inside";
    }
    setDropTarget({ slotId: slot.id, pos });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const draggingId = draggingRef.current;
    draggingRef.current = null;
    const t = dropTarget;
    setDropTarget(null);
    if (!draggingId || !t || draggingId === slot.id) return;

    if (t.pos === "inside") {
      reparent(draggingId, slot.id, slot.children.length);
    } else {
      // need parent and index
      const parent = findParentInRoot(root, slot.id);
      if (!parent) return;
      const idx = parent.children.findIndex((c) => c.id === slot.id);
      if (idx < 0) return;
      reparent(draggingId, parent.id, t.pos === "before" ? idx : idx + 1);
    }
  }

  function commitRename() {
    setEditing(false);
    const v = editValue.trim();
    // Compare against the shown name (auto default OR existing custom): accepting
    // the prefilled default is a no-op (keeps auto-naming), while a real change
    // writes a custom slot.name that then overrides the auto-name everywhere.
    if (v && v !== displayName) rename(slot.id, v);
    else setEditValue(displayName);
  }

  return (
    <div>
      {isDropBefore && <DropIndicator depth={depth} />}
      <div
        draggable={!isRoot}
        onDragStart={(e) => {
          if (isRoot) return;
          draggingRef.current = slot.id;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", slot.id);
        }}
        onDragEnd={() => {
          draggingRef.current = null;
          setDropTarget(null);
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => select(slot.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openContextMenu(e.clientX, e.clientY, slot.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!locked) {
            setEditValue(displayName);
            setEditing(true);
          }
        }}
        style={{ paddingLeft: 4 + depth * 12 }}
        className={`group relative flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-sm ${
          selected
            ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
            : isDropInside
              ? "bg-sky-500/10 ring-1 ring-sky-500/60"
              : locked
                ? "text-slate-500 hover:bg-slate-800"
                : "text-slate-300 hover:bg-slate-800"
        }`}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapsed(slot.id);
            }}
            className="flex h-4 w-4 items-center justify-center rounded text-[10px] text-slate-500 hover:bg-slate-700 hover:text-slate-200"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "▶" : "▼"}
          </button>
        ) : (
          <span className="inline-block h-4 w-4" />
        )}
        {locked && <span className="text-[10px] text-yellow-400/70">🔒</span>}
        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              else if (e.key === "Escape") {
                setEditing(false);
                setEditValue(displayName);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded border border-sky-500 bg-slate-950 px-1 text-sm text-slate-100 outline-none"
          />
        ) : (
          <span className="truncate" title={displayName}>
            {displayName}
          </span>
        )}
        <span className="ml-1 text-[10px] text-slate-600">({slot.components.length})</span>
        <div className="ml-auto hidden items-center gap-1 group-hover:flex">
          <button
            title={locked ? "Unlock layer" : "Lock layer"}
            className="rounded px-1 text-slate-400 hover:text-yellow-300"
            onClick={(e) => {
              e.stopPropagation();
              toggleLock(slot.id);
            }}
          >
            {locked ? "🔓" : "🔒"}
          </button>
          <button
            title="Add child slot"
            className="rounded px-1 text-slate-400 hover:text-sky-300"
            onClick={(e) => {
              e.stopPropagation();
              addChild(slot.id);
            }}
          >
            +
          </button>
          {!isRoot && (
            <button
              title="Duplicate (Ctrl+D)"
              className="rounded px-1 text-slate-400 hover:text-sky-300"
              onClick={(e) => {
                e.stopPropagation();
                duplicate(slot.id);
              }}
            >
              ⎘
            </button>
          )}
          {!isRoot && (
            <button
              title="Delete"
              className="rounded px-1 text-slate-400 hover:text-rose-300"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete slot "${displayName}" and its children?`)) remove(slot.id);
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {isDropAfter && <DropIndicator depth={depth} />}
      {!collapsed &&
        // Structural backdrop slots (Background / Front Backing / Back Cover)
        // are hidden from the tree — they're managed by the Background menu and
        // still render + export from the model. (Filtered for display only.)
        slot.children
          .filter((child) => !isStructuralSlot(child))
          .map((child) => (
            <SlotNode
              key={child.id}
              slot={child}
              depth={depth + 1}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              draggingRef={draggingRef}
            />
          ))}
    </div>
  );
}

function DropIndicator({ depth }: { depth: number }) {
  return (
    <div
      style={{ marginLeft: 4 + depth * 12 }}
      className="my-[1px] h-[2px] rounded bg-sky-400"
    />
  );
}

function findParentInRoot(root: Slot, id: string): Slot | null {
  function walk(node: Slot): Slot | null {
    for (const c of node.children) {
      if (c.id === id) return node;
      const r = walk(c);
      if (r) return r;
    }
    return null;
  }
  return walk(root);
}
