import { useState, type FormEvent } from "react";
import type { LoginProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { useSkin } from "../_skins/context";
import { BrandMark, FieldShell } from "../_shared/basic";
import { FormError } from "../_shared/auth";

export default function Login({ brand, badge, headline, description, features, onSubmit, submitting, error, signupHref, forgotPasswordHref }: LoginProps) {
  const s = useSkin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit(email, password);
  };
  return (
    <main className="grid min-h-screen bg-bg lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="[&_span]:text-primary-foreground">
          <BrandMark brand={brand} />
        </div>
        <div>
          {badge && <p className="mb-3 text-sm uppercase tracking-wide opacity-80">{badge}</p>}
          <h2 className="text-3xl font-semibold leading-tight">{headline}</h2>
          {description && <p className="mt-4 max-w-md opacity-90">{description}</p>}
          {features && features.length > 0 && (
            <ul className="mt-8 space-y-4">
              {features.map((f) => (
                <li key={f.title} className="flex gap-3">
                  <Icon name={f.icon ?? "Check"} className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium">{f.title}</p>
                    <p className="text-sm opacity-80">{f.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs opacity-70">{brand.name}</p>
      </aside>
      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" aria-label="Sign in">
          <div className="lg:hidden">
            <BrandMark brand={brand} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-fg">Welcome back</h1>
            <p className="mt-1 text-sm text-muted">Sign in to {brand.name}</p>
          </div>
          <FieldShell id="login-email" label="Email" required>
            <input id="login-email" type="email" autoComplete="email" required className={s.input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </FieldShell>
          <FieldShell id="login-password" label="Password" required>
            <input id="login-password" type="password" autoComplete="current-password" required className={s.input} value={password} onChange={(e) => setPassword(e.target.value)} />
          </FieldShell>
          {forgotPasswordHref && (
            <SparcLink href={forgotPasswordHref} className="block text-right text-sm text-primary hover:underline">
              Forgot password?
            </SparcLink>
          )}
          <FormError message={error} />
          <button type="submit" className={s.button("primary", "w-full")} disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          {signupHref && (
            <p className="text-center text-sm text-muted">
              New here?{" "}
              <SparcLink href={signupHref} className="text-primary hover:underline">
                Create an account
              </SparcLink>
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
