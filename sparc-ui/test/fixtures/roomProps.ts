// Valid sample props for EVERY room. The type below makes TypeScript fail if a
// room is missing or a sample does not match its contract, so this file is
// also a compile-time check of the contracts themselves.
import type { RoomId, RoomPropsMap } from "@contracts";

const noop = () => {};
const asyncNoop = async () => {};
const brand = { name: "Sunrise Clinic", logoText: "SC" };

/** For each room: sample props + one text that the rendered component must show. */
export const SAMPLES: { [K in RoomId]: { props: RoomPropsMap[K]; expectText: string } } = {
  navbar: { props: { brand, links: [{ label: "Services", href: "#services" }], cta: { label: "Book now", href: "#book" } }, expectText: "Services" },
  footer: { props: { brand, text: "Family care since 2012.", copyright: "© 2026 Sunrise Clinic" }, expectText: "© 2026 Sunrise Clinic" },
  "not-found": { props: { title: "Page not found", message: "Nothing here.", homeHref: "/" }, expectText: "Page not found" },
  hero: { props: { title: "Care for the whole family", highlight: "whole family", subtitle: "Open 7 days.", primaryCta: { label: "Book", href: "#b" } }, expectText: "Open 7 days." },
  about: { props: { heading: "About us", body: "We are a family clinic.", highlights: [{ value: "14 yrs", label: "Serving" }] }, expectText: "We are a family clinic." },
  projects: { props: { heading: "Projects", items: [{ title: "SPARC AI", description: "Builds websites.", tags: ["React"], featured: true }] }, expectText: "SPARC AI" },
  skills: { props: { heading: "Skills", groups: [{ name: "Frontend", items: ["React", "TypeScript"] }] }, expectText: "TypeScript" },
  experience: { props: { heading: "Experience", items: [{ title: "Intern", organization: "Acme", period: "2026", bullets: ["Shipped a dashboard"] }] }, expectText: "Shipped a dashboard" },
  education: { props: { heading: "Education", items: [{ title: "B.Tech CSE", organization: "Example Institute", period: "2023 – 2027" }] }, expectText: "B.Tech CSE" },
  services: { props: { heading: "Services", items: [{ title: "Diagnostics", description: "Reports in 24h.", icon: "Activity" }] }, expectText: "Reports in 24h." },
  stats: { props: { items: [{ value: "40k+", label: "Patients" }] }, expectText: "40k+" },
  testimonials: {
    props: { heading: "Reviews", items: [{ quote: "Very kind staff.", author: "Neha" }, { quote: "Reports came the same evening.", author: "Arvind" }] },
    expectText: "Very kind staff.",
  },
  "resume-download": { props: { label: "Download CV", href: "/cv.pdf", note: "Updated 2026" }, expectText: "Download CV" },
  contact: { props: { heading: "Contact", links: [{ type: "email", label: "hello@example.com", href: "mailto:hello@example.com" }] }, expectText: "hello@example.com" },
  "contact-form": { props: { heading: "Say hello", onSubmit: asyncNoop, submitting: false, sent: false }, expectText: "Send message" },
  pricing: {
    props: { heading: "Pricing", plans: [{ name: "Family plan", price: "₹4,999", features: ["Unlimited visits"], cta: { label: "Join", href: "#j" }, highlighted: true }] },
    expectText: "Unlimited visits",
  },
  faq: { props: { heading: "FAQ", items: [{ question: "Do I need an appointment?", answer: "No." }] }, expectText: "Do I need an appointment?" },
  team: { props: { heading: "Doctors", members: [{ name: "Dr. Kavya Iyer", role: "Physician" }] }, expectText: "Dr. Kavya Iyer" },
  gallery: { props: { heading: "Gallery", images: [{ src: "/a.jpg", alt: "Reception", caption: "Our reception" }] }, expectText: "Our reception" },
  "location-map": { props: { heading: "Visit us", address: "12 Example Road, Pune", hours: ["Mon–Sat 9–8"] }, expectText: "12 Example Road, Pune" },
  "cta-banner": { props: { title: "Feeling unwell?", cta: { label: "Book a visit", href: "#b" } }, expectText: "Feeling unwell?" },
  newsletter: { props: { heading: "Health tips", onSubscribe: asyncNoop, submitting: false, done: false }, expectText: "Subscribe" },
  login: { props: { brand, headline: "Coordinate care", onSubmit: asyncNoop, submitting: false, error: "Invalid email or password" }, expectText: "Invalid email or password" },
  signup: { props: { brand, onSubmit: asyncNoop, submitting: false, loginHref: "/login" }, expectText: "Create your account" },
  "forgot-password": { props: { brand, onSubmit: asyncNoop, submitting: false, sent: false, loginHref: "/login" }, expectText: "Send reset link" },
  "app-frame": {
    props: { brand, navItems: [{ label: "Patients", href: "/patients", active: true }], user: { name: "Riya", email: "riya@example.in" }, onLogout: noop, children: "Page body" },
    expectText: "Page body",
  },
  "dashboard-stat-card": { props: { label: "Patients", value: "128", icon: "Users", trend: 12 }, expectText: "128" },
  "dashboard-chart": { props: { title: "Patients by status", variant: "bar", data: [{ label: "In Care", value: 7 }] }, expectText: "In Care" },
  "data-table": {
    props: {
      columns: [{ key: "name", label: "Name", sortable: true }, { key: "fee", label: "Fee", type: "currency" }],
      rows: [{ id: "1", name: "Aarav", fee: 1500 }],
      loading: false,
      page: { page: 1, pageSize: 10, total: 1 },
      onPageChange: noop,
    },
    expectText: "Aarav",
  },
  "filter-bar": { props: { search: "", onSearchChange: noop, filters: [{ key: "status", label: "Status", options: ["New"] }], values: {}, onFilterChange: noop }, expectText: "All status" },
  "form-field": { props: { field: { key: "name", label: "Patient name", type: "text", required: true }, value: "", onChange: noop }, expectText: "Patient name" },
  "record-form": {
    props: {
      title: "Add patient",
      fields: [{ key: "name", label: "Patient name", type: "text", required: true }],
      values: {},
      errors: {},
      onChange: noop,
      onSubmit: asyncNoop,
      onCancel: noop,
      submitting: false,
      renderField: (f) => f.label,
    },
    expectText: "Patient name",
  },
  "record-detail": { props: { title: "Aarav", fields: [{ key: "fee", label: "Fee", type: "currency", required: false }], record: { fee: 1500 } }, expectText: "₹1,500" },
  "confirm-dialog": { props: { open: true, title: "Delete this patient?", confirmLabel: "Delete", onConfirm: noop, onCancel: noop }, expectText: "Delete this patient?" },
  "empty-state": { props: { title: "No patients yet", actionLabel: "Add patient", onAction: noop }, expectText: "No patients yet" },
  "export-button": { props: { label: "Export CSV", onExport: asyncNoop, busy: false }, expectText: "Export CSV" },
  profile: {
    props: { user: { name: "Riya", email: "riya@example.in" }, fields: [{ key: "name", label: "Full name", type: "text", required: true }], values: { name: "Riya" }, onSave: asyncNoop, saving: false },
    expectText: "riya@example.in",
  },
  settings: {
    props: { sections: [{ id: "lists", title: "Lists", fields: [{ key: "show", label: "Show banner", type: "toggle", required: false }] }], values: {}, onSave: asyncNoop, saving: false },
    expectText: "Show banner",
  },
  "users-roles": { props: { users: [{ name: "Riya", email: "riya@example.in", role: "Staff" }], roles: ["Admin", "Staff"], onInvite: asyncNoop, onRoleChange: asyncNoop, busy: false }, expectText: "riya@example.in" },
  "file-upload": { props: { onUpload: asyncNoop, uploading: false, maxSizeMb: 5 }, expectText: "Up to 5 MB" },
  notifications: { props: { items: [{ id: "1", title: "Patient added", at: new Date().toISOString(), read: false }], onMarkRead: noop }, expectText: "1" },
  "activity-log": { props: { heading: "Recent activity", items: [{ actor: "Riya", action: "added", target: "patient Aarav", at: new Date().toISOString() }] }, expectText: "Recent activity" },
  "product-list": {
    props: {
      heading: "Our teas",
      products: [{ id: "assam-breakfast", name: "Assam Breakfast", description: "Malty and bold.", price: 349, compareAtPrice: 399, badge: "Bestseller" }, { id: "gift-box", name: "Gift Box", price: 1199, inStock: false }],
      currency: "INR",
      productHref: (id) => `/product/${id}`,
      onAdd: noop,
    },
    expectText: "Assam Breakfast",
  },
  "product-page": {
    props: { product: { id: "assam-breakfast", name: "Assam Breakfast", description: "Malty and bold.", price: 349 }, currency: "INR", inCart: 1, onAdd: noop, backHref: "/", cartHref: "/cart" },
    expectText: "Malty and bold.",
  },
  cart: {
    props: { heading: "Your cart", lines: [{ productId: "assam-breakfast", name: "Assam Breakfast", price: 349, qty: 2 }], currency: "INR", subtotal: 698, onQty: noop, onRemove: noop, checkoutHref: "/checkout", shopHref: "/" },
    expectText: "Go to checkout",
  },
  "checkout-payment": {
    props: {
      heading: "Checkout",
      lines: [{ productId: "assam-breakfast", name: "Assam Breakfast", price: 349, qty: 2 }],
      currency: "INR",
      total: 698,
      mode: "test",
      onPay: asyncNoop,
      paying: false,
      error: "The card was declined",
      backHref: "/cart",
    },
    expectText: "The card was declined",
  },
  "order-confirmation": {
    props: { heading: "Thank you for your order!", orderId: "ORD-7K3F9Q", total: 698, currency: "INR", email: "a@b.in", lines: [{ productId: "assam-breakfast", name: "Assam Breakfast", price: 349, qty: 2 }], continueHref: "/" },
    expectText: "ORD-7K3F9Q",
  },
  "services-list": {
    props: { heading: "Choose a service", services: [{ id: "consult", name: "General consultation", description: "See a doctor.", durationMin: 30, price: 500 }], currency: "INR", selectedId: "consult", onSelect: noop },
    expectText: "General consultation",
  },
  "slot-picker": {
    props: {
      heading: "Pick a day and time",
      serviceName: "General consultation",
      date: "2026-12-01",
      minDate: "2026-11-20",
      maxDate: "2027-01-01",
      slots: [{ id: "09:00", label: "9:00 AM", available: true }, { id: "09:30", label: "9:30 AM", available: false }],
      selectedSlotId: "09:00",
      onDateChange: noop,
      onSelect: noop,
    },
    expectText: "9:00 AM",
  },
  "booking-form": { props: { heading: "Your details", summary: "General consultation, Tuesday 10:00 AM", ready: true, onSubmit: asyncNoop, submitting: false }, expectText: "Confirm booking" },
  "booking-confirmation": {
    props: { heading: "You are booked!", reference: "BK-4X7M2P", serviceName: "General consultation", whenLabel: "Tuesday at 10:00 AM", name: "Aarav", homeHref: "/" },
    expectText: "BK-4X7M2P",
  },
};
