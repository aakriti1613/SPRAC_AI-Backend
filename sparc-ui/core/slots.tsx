// The slot system. A shell never imports a specific component: it renders
//   <Slot room="hero" props={...} />
// and the registry (src/registries/<level>.ts, written by the generator/assembler) decides
// WHICH component fills that room. TypeScript makes sure every registered
// component accepts exactly its room's contract.
import { Component, createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { FormFieldProps, RoomId, RoomPropsMap, StyleLevel } from "@contracts";
import type { FieldType } from "./format";

export type SlotComponents = { [K in RoomId]?: ComponentType<RoomPropsMap[K]> };
export type FieldComponents = Partial<Record<FieldType, ComponentType<FormFieldProps>>>;

export interface SlotRegistry {
  styleLevel: StyleLevel;
  rooms: SlotComponents;
  /** form-field components by field type */
  fields: FieldComponents;
}

/** Build the field-type -> component map from form-field modules that export `fieldTypes`. */
export function fieldMap(entries: { component: ComponentType<FormFieldProps>; fieldTypes: readonly FieldType[] }[]): FieldComponents {
  const out: FieldComponents = {};
  for (const { component, fieldTypes } of entries) {
    for (const t of fieldTypes) {
      if (out[t]) throw new Error(`two form-field components claim field type "${t}"`);
      out[t] = component;
    }
  }
  return out;
}

const SlotContext = createContext<SlotRegistry | null>(null);

export function SlotsProvider({ registry, children }: { registry: SlotRegistry; children: ReactNode }) {
  return <SlotContext.Provider value={registry}>{children}</SlotContext.Provider>;
}

export function useSlots(): SlotRegistry {
  const ctx = useContext(SlotContext);
  if (!ctx) throw new Error("useSlots must be used inside <SlotsProvider>");
  return ctx;
}

/** Component for one field type (falls back to the "text" component). */
export function useFieldComponent(type: FieldType): ComponentType<FormFieldProps> | undefined {
  const { fields } = useSlots();
  return fields[type] ?? fields.text;
}

class RoomBoundary extends Component<{ room: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(`[sparc] room "${this.props.room}" crashed:`, error);
  }
  render() {
    if (this.state.failed) {
      return (
        <div role="alert" data-sparc-error={this.props.room} className="m-4 rounded-sparc border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          This part of the page (“{this.props.room}”) could not be shown.
        </div>
      );
    }
    return this.props.children;
  }
}

/** Renders the form-field component registered for this field's type. */
export function FieldSlot(props: FormFieldProps) {
  const Cmp = useFieldComponent(props.field.type);
  if (!Cmp) {
    return (
      <div role="alert" data-sparc-missing="form-field" className="text-sm text-warning">
        No input component for field type “{props.field.type}”.
      </div>
    );
  }
  return (
    <div data-sparc-room="form-field" data-field-type={props.field.type} className="contents">
      <RoomBoundary room={`form-field:${props.field.type}`}>
        <Cmp {...props} />
      </RoomBoundary>
    </div>
  );
}

interface SlotProps<K extends RoomId> {
  room: K;
  props: RoomPropsMap[K];
  /** Anchor id (site sections). */
  id?: string;
  /** Wrapper classes. Default "contents" = the wrapper takes no space. */
  className?: string;
}

export function Slot<K extends RoomId>({ room, props, id, className }: SlotProps<K>) {
  const { rooms } = useSlots();
  const Cmp = rooms[room] as ComponentType<RoomPropsMap[K]> | undefined;
  if (!Cmp) {
    return (
      <div role="alert" data-sparc-missing={room} className="m-4 rounded-sparc border border-warning/50 bg-warning/5 p-4 text-sm text-warning">
        No component is registered for room “{room}”.
      </div>
    );
  }
  return (
    <div data-sparc-room={room} id={id} className={className ?? "contents"}>
      <RoomBoundary room={room}>
        <Cmp {...props} />
      </RoomBoundary>
    </div>
  );
}
