// Layout shared by the login / signup / forgot-password views.
import type { ReactNode } from "react";
import type { Brand } from "@contracts";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";
import { BrandMark } from "./basic";

export function AuthCard({ brand, title, subtitle, children }: { brand: Brand; title: string; subtitle?: string; children: ReactNode }) {
  const s = useSkin();
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <s.Backdrop variant="page" />
      <div className={cn(s.card, "w-full max-w-md p-8")}>
        <BrandMark brand={brand} />
        <h1 className="mt-6 text-xl font-semibold text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-sparc bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
