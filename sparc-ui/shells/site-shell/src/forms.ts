// Sends contact-form / newsletter submissions. With VITE_FORM_ENDPOINT set,
// it POSTs JSON there (e.g. Formspree, a Supabase Edge Function). Without it,
// demo mode accepts the submission and logs it.
export type FormKind = "contact" | "newsletter" | "order" | "booking";
export type SubmitFn = (kind: FormKind, values: Record<string, string>) => Promise<void>;

export function createSubmitter(endpoint: string | undefined): SubmitFn {
  return async (kind, values) => {
    if (!endpoint) {
      console.info(`[demo] ${kind} form submitted`, values);
      await new Promise((r) => setTimeout(r, 300));
      return;
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ form: kind, ...values }),
    });
    if (!res.ok) throw new Error("Sorry, that didn't go through. Please try again.");
  };
}
