// Site shell (dhaancha) for "portfolio" and "landing" website types.
// One long home page: rooms in blueprint order, content from the config.
import { useEffect, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import type { NavLink, RoomId } from "@contracts";
import { enabledRooms, roomsOnPage } from "@core/blueprint";
import type { SiteConfig } from "@core/config";
import { Slot, SlotsProvider, type SlotRegistry } from "@core/slots";
import { applyTheme } from "@core/theme";
import type { SubmitFn } from "./forms";

/** Rooms that never appear as menu links. */
const NOT_IN_MENU = new Set<RoomId>(["navbar", "footer", "hero", "stats", "cta-banner", "resume-download", "not-found", "newsletter"]);

const titleCase = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function menuLinks(config: SiteConfig, rooms: RoomId[]): NavLink[] {
  if (config.nav?.links?.length) return config.nav.links;
  return rooms
    .filter((r) => !NOT_IN_MENU.has(r))
    .map((r) => {
      const content = config.sections[r as keyof SiteConfig["sections"]] as { heading?: string } | undefined;
      return { label: content?.heading ?? titleCase(r), href: `#${r}` };
    })
    .slice(0, 6);
}

function useForm(kind: "contact" | "newsletter", submit: SubmitFn) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const send = async (values: Record<string, string>) => {
    setSubmitting(true);
    setError(undefined);
    try {
      await submit(kind, values);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };
  return { submitting, done, error, send };
}

function ContactForm({ config, submit }: { config: SiteConfig; submit: SubmitFn }) {
  const f = useForm("contact", submit);
  const content = config.sections["contact-form"];
  return (
    <Slot
      room="contact-form"
      id="contact-form"
      className="block scroll-mt-20"
      props={{
        heading: content?.heading ?? "Send a message",
        text: content?.text,
        submitting: f.submitting,
        sent: f.done,
        error: f.error,
        onSubmit: (values) => f.send(values),
      }}
    />
  );
}

function Newsletter({ config, submit }: { config: SiteConfig; submit: SubmitFn }) {
  const f = useForm("newsletter", submit);
  const content = config.sections.newsletter;
  return (
    <Slot
      room="newsletter"
      id="newsletter"
      className="block scroll-mt-20"
      props={{
        heading: content?.heading ?? "Stay in the loop",
        text: content?.text,
        submitting: f.submitting,
        done: f.done,
        error: f.error,
        onSubscribe: (email) => f.send({ email }),
      }}
    />
  );
}

function HomePage({ config, rooms, submit }: { config: SiteConfig; rooms: RoomId[]; submit: SubmitFn }) {
  const year = new Date().getFullYear();
  return (
    <>
      {rooms.map((room) => {
        switch (room) {
          case "navbar":
            return <Slot key={room} room="navbar" props={{ brand: config.brand, links: menuLinks(config, rooms), cta: config.nav?.cta }} />;
          case "footer":
            return (
              <Slot
                key={room}
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
          case "contact-form":
            return <ContactForm key={room} config={config} submit={submit} />;
          case "newsletter":
            return <Newsletter key={room} config={config} submit={submit} />;
          default: {
            const props = config.sections[room as keyof SiteConfig["sections"]];
            if (!props) return null; // checkSiteConfig reports missing content
            return <Slot key={room} room={room} id={room} className="block scroll-mt-20" props={props as never} />;
          }
        }
      })}
    </>
  );
}

export function SiteApp({ config, blueprint, registry, submit }: { config: SiteConfig; blueprint: Parameters<typeof enabledRooms>[0]; registry: SlotRegistry; submit: SubmitFn }) {
  const enabled = useMemo(() => enabledRooms(blueprint, config.rooms.enabled), [blueprint, config.rooms.enabled]);
  const rooms = useMemo(() => roomsOnPage(blueprint, "home", enabled), [blueprint, enabled]);

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

  return (
    <SlotsProvider registry={registry}>
      <Routes>
        <Route path="/" element={<HomePage config={config} rooms={rooms} submit={submit} />} />
        <Route
          path="*"
          element={
            <Slot
              room="not-found"
              props={{
                title: config.notFound?.title ?? "Page not found",
                message: config.notFound?.message ?? "This page does not exist.",
                homeHref: "/",
              }}
            />
          }
        />
      </Routes>
    </SlotsProvider>
  );
}
