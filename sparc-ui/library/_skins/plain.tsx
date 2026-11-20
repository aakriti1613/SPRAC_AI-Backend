// Effect components without animation (used by Basic and Good).
import type { ItemProps, ListProps, Skin, WrapProps } from "./types";

/**
 * Always a real <div>: the animated versions render a motion.div, so every level
 * must have the same element structure or grid/flex layouts break (e.g. the
 * hero's two columns).
 */
export function PlainWrap({ children, className }: WrapProps) {
  return <div className={className}>{children}</div>;
}

export function PlainList({ as: Tag = "ul", className, children }: ListProps) {
  return <Tag className={className}>{children}</Tag>;
}

export function PlainItem({ as: Tag = "li", className, children }: ItemProps) {
  return <Tag className={className}>{children}</Tag>;
}

export function PlainCount({ value }: { value: string }) {
  return <>{value}</>;
}

export function PlainGrow({ percent, className }: { percent: number; className?: string }) {
  return <div className={className} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />;
}

export function NoBackdrop() {
  return null;
}

export const plainEffects: Pick<Skin, "Reveal" | "List" | "Item" | "Hover" | "Count" | "Grow" | "Backdrop" | "Marquee"> = {
  Reveal: PlainWrap,
  List: PlainList,
  Item: PlainItem,
  Hover: PlainWrap,
  Count: PlainCount,
  Grow: PlainGrow,
  Backdrop: NoBackdrop,
  Marquee: null,
};
