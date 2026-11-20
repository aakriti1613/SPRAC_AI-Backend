import { useState, type FormEvent } from "react";
import type { ForgotPasswordProps } from "@contracts";
import { SparcLink } from "@core/link";
import { useSkin } from "../_skins/context";
import { FieldShell } from "../_shared/basic";
import { AuthCard, FormError } from "../_shared/auth";

export default function ForgotPassword({ brand, onSubmit, submitting, sent, error, loginHref }: ForgotPasswordProps) {
  const s = useSkin();
  const [email, setEmail] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit(email);
  };
  return (
    <AuthCard brand={brand} title="Reset your password" subtitle="We'll email you a link to choose a new password.">
      {sent ? (
        <p role="status" className="rounded-sparc bg-success/10 px-3 py-3 text-sm text-success">
          If an account exists for that email, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FieldShell id="fp-email" label="Email" required>
            <input id="fp-email" type="email" required autoComplete="email" className={s.input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </FieldShell>
          <FormError message={error} />
          <button type="submit" className={s.button("primary", "w-full")} disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <SparcLink href={loginHref} className="mt-4 block text-center text-sm text-primary hover:underline">
        Back to sign in
      </SparcLink>
    </AuthCard>
  );
}
