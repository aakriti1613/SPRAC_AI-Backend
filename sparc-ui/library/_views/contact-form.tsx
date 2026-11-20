import { useState, type FormEvent } from "react";
import type { ContactFormProps } from "@contracts";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { FieldShell, Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function ContactFormView({ heading, text, onSubmit, submitting, sent, error }: ContactFormProps) {
  const s = useSkin();
  const [values, setValues] = useState({ name: "", email: "", message: "" });
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit(values);
  };
  return (
    <Section>
      <div className="mx-auto max-w-xl">
        <SectionTitle title={heading} subtitle={text} />
        {sent ? (
          <div role="status" className={cn(s.card, "flex items-center gap-3 p-6 text-fg")}>
            <Icon name="CircleCheck" className="h-6 w-6 text-success" /> Thanks! Your message was sent.
          </div>
        ) : (
          <form onSubmit={submit} className={cn(s.card, "space-y-4 p-6")}>
            <FieldShell id="cf-name" label="Name" required>
              <input id="cf-name" required className={s.input} value={values.name} onChange={set("name")} autoComplete="name" />
            </FieldShell>
            <FieldShell id="cf-email" label="Email" required>
              <input id="cf-email" type="email" required className={s.input} value={values.email} onChange={set("email")} autoComplete="email" />
            </FieldShell>
            <FieldShell id="cf-message" label="Message" required>
              <textarea id="cf-message" required rows={5} className={cn(s.input, "h-auto py-2")} value={values.message} onChange={set("message")} />
            </FieldShell>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <button type="submit" className={s.button("primary", "w-full")} disabled={submitting}>
              {submitting ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </div>
    </Section>
  );
}
