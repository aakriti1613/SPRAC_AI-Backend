import type { EducationProps } from "@contracts";
import { Timeline } from "../_shared/basic";

export default function EducationView({ heading, items }: EducationProps) {
  return <Timeline heading={heading} items={items} />;
}
