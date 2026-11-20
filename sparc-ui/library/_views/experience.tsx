import type { ExperienceProps } from "@contracts";
import { Timeline } from "../_shared/basic";

export default function ExperienceView({ heading, items }: ExperienceProps) {
  return <Timeline heading={heading} items={items} />;
}
