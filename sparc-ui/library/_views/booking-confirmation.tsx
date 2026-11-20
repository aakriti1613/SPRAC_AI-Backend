import type { BookingConfirmationProps } from "@contracts";
import { Icon } from "@core/icons";
import { SparcLink } from "@core/link";
import { cn } from "@core/ui";
import { Section } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function BookingConfirmationView({ heading, reference, serviceName, whenLabel, name, email, homeHref }: BookingConfirmationProps) {
  const s = useSkin();
  return (
    <Section>
      <s.Reveal>
        <div className={cn(s.card, "mx-auto max-w-xl space-y-5 p-8 text-center")} role="status">
          <Icon name="CircleCheck" className="mx-auto h-12 w-12 text-success" />
          <h1 className={s.heading}>{heading}</h1>
          {name && <p className="text-fg">Thank you, {name}.</p>}
          <dl className="space-y-3 border-t border-border pt-4 text-left text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Booking reference</dt>
              <dd className="font-semibold text-fg">{reference}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Service</dt>
              <dd className="text-fg">{serviceName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">When</dt>
              <dd className="text-fg">{whenLabel}</dd>
            </div>
          </dl>
          {email && <p className="text-sm text-muted">A confirmation will be sent to {email}.</p>}
          <SparcLink href={homeHref} className={s.button("primary")}>
            Back to home
          </SparcLink>
        </div>
      </s.Reveal>
    </Section>
  );
}
