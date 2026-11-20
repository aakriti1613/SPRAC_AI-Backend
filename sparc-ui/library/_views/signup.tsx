import { useState, type FormEvent } from "react";
import type { SignupProps } from "@contracts";
import { SparcLink } from "@core/link";
import { useSkin } from "../_skins/context";
import { FieldShell } from "../_shared/basic";
import { AuthCard, FormError } from "../_shared/auth";

export default function Signup({ brand, onSubmit, submitting, error, loginHref }: SignupProps) {
  const s = useSkin();
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit(values);
  };
  return (
    <AuthCard brand={brand} title="Create your account">
      <form onSubmit={submit} className="space-y-4">
        <FieldShell id="su-name" label="Full name" required>
          <input id="su-name" required autoComplete="name" className={s.input} value={values.name} onChange={set("name")} />
        </FieldShell>
        <FieldShell id="su-email" label="Email" required>
          <input id="su-email" type="email" required autoComplete="email" className={s.input} value={values.email} onChange={set("email")} />
        </FieldShell>
        <FieldShell id="su-password" label="Password" required helpText="At least 8 characters.">
          <input id="su-password" type="password" required minLength={8} autoComplete="new-password" className={s.input} value={values.password} onChange={set("password")} />
        </FieldShell>
        <FormError message={error} />
        <button type="submit" className={s.button("primary", "w-full")} disabled={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </button>
        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <SparcLink href={loginHref} className="text-primary hover:underline">
            Sign in
          </SparcLink>
        </p>
      </form>
    </AuthCard>
  );
}
