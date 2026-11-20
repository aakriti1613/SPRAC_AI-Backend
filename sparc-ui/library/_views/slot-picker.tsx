import type { SlotPickerProps } from "@contracts";
import { cn } from "@core/ui";
import { FieldShell, Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function SlotPickerView({
  heading,
  serviceName,
  date,
  minDate,
  maxDate,
  slots,
  selectedSlotId,
  closedMessage,
  onDateChange,
  onSelect,
}: SlotPickerProps) {
  const s = useSkin();
  const free = slots.filter((x) => x.available).length;
  return (
    <Section>
      <SectionTitle title={heading} subtitle={serviceName ? `Booking: ${serviceName}` : "Choose a service above first."} />
      <div className={cn(s.card, "space-y-6 p-6")}>
        <div className="max-w-xs">
          <FieldShell id="sp-date" label="Day">
            <input id="sp-date" type="date" className={s.input} value={date} min={minDate} max={maxDate} onChange={(e) => onDateChange(e.target.value)} />
          </FieldShell>
        </div>
        {!serviceName ? (
          <p className="text-sm text-muted">Pick a service to see the free times.</p>
        ) : slots.length === 0 || free === 0 ? (
          <p className="text-sm text-fg" role="status">
            {closedMessage ?? "No free times on this day. Please pick another day."}
          </p>
        ) : (
          <div role="group" aria-label="Available times" className="flex flex-wrap gap-2">
            {slots.map((slot) => (
              <button
                key={slot.id}
                type="button"
                disabled={!slot.available}
                aria-pressed={slot.id === selectedSlotId}
                onClick={() => onSelect(slot.id)}
                className={cn(
                  s.chip,
                  "min-w-24 justify-center disabled:cursor-not-allowed disabled:line-through disabled:opacity-50",
                  slot.id === selectedSlotId && "border-primary bg-primary text-primary-foreground"
                )}
              >
                {slot.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
