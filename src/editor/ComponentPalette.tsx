import { UIX_COMPONENT_TYPES, type Slot, type UixComponentType } from "../model/types";
import { useStore } from "../state/store";

interface Props {
  slot: Slot;
}

export default function ComponentPalette({ slot }: Props) {
  const attach = useStore((s) => s.attachComponent);
  const present = new Set(slot.components.map((c) => c.type));
  const available = UIX_COMPONENT_TYPES.filter((t) => !present.has(t));

  if (available.length === 0) {
    return <p className="text-xs text-slate-500">All component types attached.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {available.map((type) => (
        <button
          key={type}
          onClick={() => attach(slot.id, type as UixComponentType)}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
        >
          + {type}
        </button>
      ))}
    </div>
  );
}
