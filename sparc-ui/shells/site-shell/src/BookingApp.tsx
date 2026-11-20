// Booking shell (dhaancha) for the "booking" website type.
// Home page: choose a service -> choose a day and time -> enter details.
// Then a confirmation page. Slots and the booking are handled here once.
import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type { NavLink, RoomId } from "@contracts";
import { enabledRooms, roomsOnPage } from "@core/blueprint";
import { checkBookingDetails, dateRange, firstFreeDay, newBookingRef, slotsFor, whenLabel, type Booking } from "@core/booking";
import { loadJson, saveJson } from "@core/commerce";
import type { SiteConfig } from "@core/config";
import { Slot, SlotsProvider, type SlotRegistry } from "@core/slots";
import type { SubmitFn } from "./forms";
import { FooterSlot, NavbarSlot, NotFoundSlot, useSiteChrome } from "./shared";

const BOOKINGS_KEY = "sparc.bookings";
const LAST_KEY = "sparc.lastBooking";

type Blueprint = Parameters<typeof enabledRooms>[0];

export function BookingApp({ config, blueprint, registry, submit }: { config: SiteConfig; blueprint: Blueprint; registry: SlotRegistry; submit: SubmitFn }) {
  useSiteChrome(config);
  const navigate = useNavigate();
  const settings = config.booking!;
  const { services, availability, currency } = settings;

  const [booked, setBooked] = useState<Booking[]>(() => loadJson<Booking[]>(BOOKINGS_KEY, []));
  const [serviceId, setServiceId] = useState<string>();
  const [date, setDate] = useState(() => dateRange(availability).min);
  const [slotId, setSlotId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const service = services.find((s) => s.id === serviceId);
  const { min, max } = dateRange(availability);
  const slots = useMemo(() => (service ? slotsFor(availability, date, service.durationMin, booked) : []), [availability, date, service, booked]);

  // Choosing a service jumps to the first day that has a free time.
  const choose = (id: string) => {
    setServiceId(id);
    setSlotId(undefined);
    setError(undefined);
    const svc = services.find((s) => s.id === id);
    if (svc) setDate(firstFreeDay(availability, svc.durationMin, booked) ?? min);
  };
  useEffect(() => setSlotId(undefined), [date]);

  async function onSubmit(values: { name: string; email: string; phone: string; notes: string }) {
    setError(undefined);
    if (!service || !slotId) return setError("Please choose a service and a time first.");
    const bad = checkBookingDetails(values);
    if (bad) return setError(bad);
    // Someone may have taken the time since the page was drawn.
    const stillFree = slotsFor(availability, date, service.durationMin, loadJson<Booking[]>(BOOKINGS_KEY, [])).find((s) => s.id === slotId)?.available;
    if (!stillFree) return setError("Sorry, that time is no longer available. Please pick another.");
    setSubmitting(true);
    const booking: Booking = {
      reference: newBookingRef(),
      serviceId: service.id,
      serviceName: service.name,
      date,
      time: slotId,
      durationMin: service.durationMin,
      customer: values,
      createdAt: new Date().toISOString(),
    };
    try {
      await submit("booking", { reference: booking.reference, service: service.name, date, time: slotId, durationMin: String(service.durationMin), ...values });
    } catch (e) {
      setSubmitting(false);
      return setError(e instanceof Error ? e.message : String(e));
    }
    const all = [...loadJson<Booking[]>(BOOKINGS_KEY, []), booking];
    saveJson(BOOKINGS_KEY, all);
    saveJson(LAST_KEY, booking);
    setBooked(all);
    setSubmitting(false);
    navigate("/booked");
  }

  const enabled = useMemo(() => enabledRooms(blueprint, config.rooms.enabled), [blueprint, config.rooms.enabled]);
  const homeRooms = useMemo(() => roomsOnPage(blueprint, "home", enabled), [blueprint, enabled]);
  const homeLinks: NavLink[] = [
    { label: "Services", href: "#services" },
    { label: "Pick a time", href: "#times" },
    { label: "Book", href: "#book" },
  ];
  const summary = service && slotId ? `${service.name} · ${whenLabel(date, slotId)}` : undefined;

  return (
    <SlotsProvider registry={registry}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              {homeRooms.map((room) => {
                switch (room) {
                  case "navbar":
                    return <NavbarSlot key={room} config={config} links={homeLinks} />;
                  case "footer":
                    return <FooterSlot key={room} config={config} />;
                  case "services-list":
                    return (
                      <Slot
                        key={room}
                        room="services-list"
                        id="services"
                        className="block scroll-mt-20"
                        props={{ heading: "Choose a service", services, currency, selectedId: serviceId, onSelect: choose }}
                      />
                    );
                  case "slot-picker":
                    return (
                      <Slot
                        key={room}
                        room="slot-picker"
                        id="times"
                        className="block scroll-mt-20"
                        props={{
                          heading: "Pick a day and time",
                          serviceName: service?.name,
                          date,
                          minDate: min,
                          maxDate: max,
                          slots,
                          selectedSlotId: slotId,
                          closedMessage: "We are closed or fully booked on this day. Please pick another day.",
                          onDateChange: setDate,
                          onSelect: setSlotId,
                        }}
                      />
                    );
                  case "booking-form":
                    return (
                      <Slot
                        key={room}
                        room="booking-form"
                        id="book"
                        className="block scroll-mt-20"
                        props={{ heading: "Your details", summary, ready: Boolean(service && slotId), onSubmit, submitting, error }}
                      />
                    );
                  default: {
                    const props = config.sections[room as keyof SiteConfig["sections"]];
                    if (!props) return null;
                    return <Slot key={room} room={room as RoomId} id={room} className="block scroll-mt-20" props={props as never} />;
                  }
                }
              })}
            </>
          }
        />
        <Route path="/booked" element={<ConfirmedRoute config={config} />} />
        <Route path="*" element={<NotFoundSlot config={config} />} />
      </Routes>
    </SlotsProvider>
  );
}

function ConfirmedRoute({ config }: { config: SiteConfig }) {
  const last = loadJson<Booking | null>(LAST_KEY, null);
  if (!last) return <Navigate to="/" replace />;
  return (
    <>
      {/* "#services" only exists on the home page, so this page's button goes there instead */}
      <NavbarSlot config={{ ...config, nav: { ...config.nav, cta: { label: "Book another", href: "/" } } }} links={[{ label: "Home", href: "/" }]} />
      <Slot
        room="booking-confirmation"
        props={{
          heading: "You are booked!",
          reference: last.reference,
          serviceName: last.serviceName,
          whenLabel: whenLabel(last.date, last.time),
          name: last.customer.name,
          email: last.customer.email,
          homeHref: "/",
        }}
      />
      <FooterSlot config={config} />
    </>
  );
}
