import { useState, type FormEvent } from "react";
import type { NewsletterProps } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function NewsletterView({ heading, text, onSubscribe, submitting, done, error }: NewsletterProps) {
  const s = useSkin();
  const [email, setEmail] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSubscribe(email);
  };
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className={cn(s.card, "mx-auto max-w-2xl p-8 text-center", s.level !== "basic" && "bg-gradient-to-b from-primary-soft/40 to-surface")}>
        <h2 className="text-xl font-semibold text-fg">{heading}</h2>
        {text && <p className="mt-2 text-sm text-muted">{text}</p>}
        {done ? (
          <p role="status" className="mt-6 text-success">
            You're subscribed. Thank you!
          </p>
        ) : (
          <form onSubmit={submit} className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row">
            <label htmlFor="nl-email" className="sr-only">
              Email address
            </label>
            <input id="nl-email" type="email" required placeholder="you@example.com" className={s.input} value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" className={s.button("primary", "shrink-0")} disabled={submitting}>
              {submitting ? "Subscribing…" : "Subscribe"}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
