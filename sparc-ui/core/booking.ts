// Booking logic, written once: which days are open, which times are free, and
// the booking reference. Pure functions, easy to test.
import type { Slot } from "@contracts";

export interface Availability {
  /** Open weekdays, 0 = Sunday … 6 = Saturday. */
  days: number[];
  open: string; // "09:00"
  close: string; // "17:00"
  /** Gap between start times, in minutes. */
  stepMin: number;
  /** A time must be at least this many hours from now. */
  leadHours: number;
  /** How many days ahead people can book. */
  horizonDays: number;
}

export interface BookedSlot {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMin: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fromMinutes = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** YYYY-MM-DD in the local time zone (not UTC, so "today" is today). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIsoDate(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isoDate(d) === text ? d : null; // rejects 2026-02-31
}

export function dateRange(a: Availability, now = new Date()): { min: string; max: string } {
  const max = new Date(now);
  max.setDate(max.getDate() + a.horizonDays);
  return { min: isoDate(now), max: isoDate(max) };
}

export function isOpenDay(a: Availability, date: string, now = new Date()): boolean {
  const d = parseIsoDate(date);
  if (!d) return false;
  const { min, max } = dateRange(a, now);
  return date >= min && date <= max && a.days.includes(d.getDay());
}

export function label12h(hhmm: string): string {
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(mins % 60)} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Times on one day for a service of `durationMin`. A time is available when the
 * service finishes before closing, is far enough from now, and does not overlap
 * a booking already made.
 */
export function slotsFor(a: Availability, date: string, durationMin: number, booked: BookedSlot[], now = new Date()): Slot[] {
  if (!isOpenDay(a, date, now)) return [];
  const open = toMinutes(a.open);
  const close = toMinutes(a.close);
  const earliest = now.getTime() + a.leadHours * 3600_000;
  const taken = booked.filter((b) => b.date === date).map((b) => [toMinutes(b.time), toMinutes(b.time) + b.durationMin] as const);
  const day = parseIsoDate(date)!;
  const out: Slot[] = [];
  for (let start = open; start + durationMin <= close; start += a.stepMin) {
    const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(start / 60), start % 60).getTime();
    const clash = taken.some(([from, to]) => start < to && start + durationMin > from);
    out.push({ id: fromMinutes(start), label: label12h(fromMinutes(start)), available: !clash && startsAt >= earliest });
  }
  return out;
}

/** The first open day from `now` that has at least one free time, or null. */
export function firstFreeDay(a: Availability, durationMin: number, booked: BookedSlot[], now = new Date()): string | null {
  const d = new Date(now);
  for (let i = 0; i <= a.horizonDays; i += 1) {
    const iso = isoDate(d);
    if (slotsFor(a, iso, durationMin, booked, now).some((s) => s.available)) return iso;
    d.setDate(d.getDate() + 1);
  }
  return null;
}

export function whenLabel(date: string, time: string): string {
  const d = parseIsoDate(date);
  const day = d ? d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : date;
  return `${day} at ${label12h(time)}`;
}

/** Booking reference like "BK-4X7M2P". */
export function newBookingRef(random: () => number = Math.random): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(random() * chars.length)];
  return `BK-${out}`;
}

export interface Booking {
  reference: string;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  durationMin: number;
  customer: { name: string; email: string; phone: string; notes: string };
  createdAt: string;
}

export function checkBookingDetails(c: { name: string; email: string; phone: string }): string | null {
  if (!c.name.trim()) return "Please enter your name.";
  if (!/^\S+@\S+\.\S+$/.test(c.email)) return "Please enter a valid email.";
  if (c.phone.replace(/\D/g, "").length < 7) return "Please enter a valid phone number.";
  return null;
}
