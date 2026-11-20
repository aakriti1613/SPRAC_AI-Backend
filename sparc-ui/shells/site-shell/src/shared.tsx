// Pieces every site type reuses: theme + page title, the top bar, the footer and the 404 page.
import { useEffect } from "react";
import type { NavLink } from "@contracts";
import type { SiteConfig } from "@core/config";
import { Slot } from "@core/slots";
import { applyTheme } from "@core/theme";

export function useSiteChrome(config: SiteConfig) {
  useEffect(() => {
    applyTheme(config.theme);
    document.title = config.meta.title;
    if (config.meta.description) {
      let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.name = "description";
        document.head.appendChild(tag);
      }
      tag.content = config.meta.description;
    }
  }, [config]);
}

export function NavbarSlot({ config, links }: { config: SiteConfig; links: NavLink[] }) {
  return <Slot room="navbar" props={{ brand: config.brand, links, cta: config.nav?.cta }} />;
}

export function FooterSlot({ config }: { config: SiteConfig }) {
  const year = new Date().getFullYear();
  return (
    <Slot
      room="footer"
      props={{
        brand: config.brand,
        text: config.footer?.text,
        links: config.footer?.links,
        socialLinks: config.footer?.socialLinks,
        copyright: config.footer?.copyright ?? `© ${year} ${config.brand.name}. All rights reserved.`,
      }}
    />
  );
}

export function NotFoundSlot({ config }: { config: SiteConfig }) {
  return (
    <Slot
      room="not-found"
      props={{
        title: config.notFound?.title ?? "Page not found",
        message: config.notFound?.message ?? "This page does not exist.",
        homeHref: "/",
      }}
    />
  );
}
