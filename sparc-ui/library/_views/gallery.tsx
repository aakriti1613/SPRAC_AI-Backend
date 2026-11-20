import type { GalleryProps } from "@contracts";
import { cn } from "@core/ui";
import { Section, SectionTitle } from "../_shared/basic";
import { useSkin } from "../_skins/context";

export default function GalleryView({ heading, images }: GalleryProps) {
  const s = useSkin();
  return (
    <Section>
      <SectionTitle title={heading} />
      <s.List className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {images.map((img) => (
          <s.Item key={img.src}>
            <s.Hover>
              <figure className="overflow-hidden rounded-sparc">
                <img
                  src={img.src}
                  alt={img.alt}
                  loading="lazy"
                  className={cn("aspect-square w-full rounded-sparc border border-border object-cover", s.level !== "basic" && "transition-transform duration-500 hover:scale-105")}
                />
                {img.caption && <figcaption className="mt-1.5 text-xs text-muted">{img.caption}</figcaption>}
              </figure>
            </s.Hover>
          </s.Item>
        ))}
      </s.List>
    </Section>
  );
}
