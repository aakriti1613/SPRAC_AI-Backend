import { useState, type FormEvent } from "react";
import type { BookingFormProps } from "@contracts";
import { cn } from "@core/ui";
import { FieldShell, Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function BookingFormView({ heading, summary, ready, onSubmit, submitting, error }: BookingFormProps) {
  const s = useSkin();
  const [v, setV] = useState({ name: "", email: "", phone: "", notes: "" });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit(v);
  };
  return (
    <Section alt>
      <div className="mx-auto max-w-xl">
        <SectionTitle title={heading} subtitle={summary} />
        <form onSubmit={submit} className={cn(s.card, "space-y-4 p-6")}>
          <FieldShell id="bk-name" label="Your name" required>
            <input id="bk-name" required className={s.input} value={v.name} onChange={set("name")} autoComplete="name" />
          </FieldShell>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldShell id="bk-email" label="Email" required>
              <input id="bk-email" type="email" required className={s.input} value={v.email} onChange={set("email")} autoComplete="email" />
            </FieldShell>
            <FieldShell id="bk-phone" label="Phone" required>
              <input id="bk-phone" type="tel" required className={s.input} value={v.phone} onChange={set("phone")} autoComplete="tel" />
            </FieldShell>
          </div>
          <FieldShell id="bk-notes" label="Anything we should know? (optional)">
            <textarea id="bk-notes" rows={3} className={cn(s.input, "h-auto py-2")} value={v.notes} onChange={set("notes")} />
          </FieldShell>
          {!ready && <p className="text-sm text-muted">Choose a service and a time above to continue.</p>}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" className={s.button("primary", "w-full")} disabled={!ready || submitting}>
            {submitting ? "Booking…" : "Confirm booking"}
          </button>
        </form>
      </div>
    </Section>
  );
}
