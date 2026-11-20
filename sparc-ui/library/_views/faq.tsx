import type { FaqProps } from "@contracts";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function FaqView({ heading, items }: FaqProps) {
  const s = useSkin();
  return (
    <Section>
      <div className="mx-auto max-w-3xl">
        <SectionTitle title={heading} />
        <s.List as="div" className="space-y-3">
          {items.map((q) => (
            <s.Item as="div" key={q.question}>
              <details className={cn(s.card, "group p-4 transition-colors", s.level !== "basic" && "open:border-primary/40 open:shadow-md")}>
                <summary className="cursor-pointer list-none font-medium text-fg marker:hidden">
                  <span className="mr-2 inline-block text-primary transition-transform group-open:rotate-90">›</span>
                  {q.question}
                </summary>
                <p className="mt-3 pl-5 text-sm text-muted">{q.answer}</p>
              </details>
            </s.Item>
          ))}
        </s.List>
      </div>
    </Section>
  );
}
