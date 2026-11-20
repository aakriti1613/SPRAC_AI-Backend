// SPARC AI room catalogue — every "room" (slot) a website can have, and its
// plug shape (contract). Any component placed in a room, at ANY style level,
// must accept exactly these props. Components only decide the LOOK; data,
// saving, login and routing come from the shell (dhaancha) through these props.
//
// kind:
//   "visual"   — mostly looks; gets a skin for every allowed style level
//   "workflow" — the logic lives once in the shell (hooks); V1 ships 2 skins
//
// This file is the single source for rooms. Blueprints reference rooms by id;
// TypeScript types and docs are generated from it (npm run sparc:generate).
import { FIELD_TYPE_NAMES } from "../lib/fieldTypes.js";
import { anyValue, bool, date, fn, icon, image, list, node, num, oneOf, record, required as req, shape, str, text, url } from "./propSpec.js";

// ---------------------------------------------------------------------------
// Shared shapes (become named TypeScript interfaces)
// ---------------------------------------------------------------------------
export const SHAPES = {
  Brand: {
    description: "Name and logo of the site / portal.",
    fields: {
      name: req(str("Display name")),
      logoUrl: image("Logo image; if empty, show logoText"),
      logoText: str("Fallback initials, e.g. 'SC'"),
    },
  },
  NavLink: {
    description: "One item in a menu.",
    fields: {
      label: req(str("Text shown")),
      href: req(url("Where it goes")),
      icon: icon("Optional icon name"),
      active: bool("True for the current page"),
    },
  },
  Cta: {
    description: "A call-to-action button.",
    fields: { label: req(str("Button text")), href: req(url("Target link")) },
  },
  SocialLink: {
    description: "A contact or social profile link.",
    fields: {
      type: req(oneOf(["email", "phone", "github", "linkedin", "twitter", "instagram", "website", "other"], "Kind of link")),
      label: req(str("Text shown")),
      href: req(url("Link (mailto:/tel: allowed)")),
    },
  },
  ImageRef: {
    description: "An image with alt text.",
    fields: { src: req(image("Image URL")), alt: req(str("Alt text for screen readers")), caption: str("Optional caption") },
  },
  Feature: {
    description: "A feature / service item.",
    fields: { title: req(str("Title")), description: req(text("Short description")), icon: icon("Optional icon name") },
  },
  Stat: {
    description: "A number with a label.",
    fields: { value: req(str("Value as shown, e.g. '4+' or '₹2.4L'")), label: req(str("What it means")) },
  },
  Project: {
    description: "A portfolio project.",
    fields: {
      title: req(str("Project name")),
      description: req(text("What it is / does")),
      tags: list(str("Tech or topic"), "Tags"),
      image: image("Screenshot"),
      href: url("Live link"),
      repoHref: url("Source code link"),
      featured: bool("Highlight this project"),
    },
  },
  TimelineItem: {
    description: "One entry of experience or education.",
    fields: {
      title: req(str("Role or degree")),
      organization: req(str("Company or school")),
      period: req(str("e.g. '2022 – Present'")),
      location: str("City / remote"),
      description: text("Summary"),
      bullets: list(str("Achievement"), "Bullet points"),
    },
  },
  SkillGroup: {
    description: "A named group of skills.",
    fields: { name: req(str("Group name, e.g. 'Frontend'")), items: req(list(str("Skill"), "Skills in this group")) },
  },
  Testimonial: {
    description: "A quote from a client or colleague.",
    fields: { quote: req(text("The quote")), author: req(str("Who said it")), role: str("Their role / company"), avatar: image("Photo") },
  },
  PricingPlan: {
    description: "One pricing plan.",
    fields: {
      name: req(str("Plan name")),
      price: req(str("Price as shown, e.g. '₹999'")),
      period: str("e.g. 'per month'"),
      features: req(list(str("Included item"), "What is included")),
      cta: req(shape("Cta", "Plan button")),
      highlighted: bool("Mark as recommended"),
    },
  },
  FaqItem: {
    description: "A question and its answer.",
    fields: { question: req(str("Question")), answer: req(text("Answer")) },
  },
  TeamMember: {
    description: "A team member.",
    fields: { name: req(str("Name")), role: req(str("Role")), photo: image("Photo"), links: list(shape("SocialLink"), "Profiles") },
  },
  Product: {
    description: "One item for sale.",
    fields: {
      id: req(str("Stable id, lowercase-with-dashes")),
      name: req(str("Product name")),
      description: text("Short description"),
      price: req(num("Price in the store currency (major units, e.g. 499)")),
      compareAtPrice: num("Old price, shown struck through"),
      image: image("Product photo"),
      category: str("Category label"),
      badge: str("Small label, e.g. 'New'"),
      inStock: bool("False = cannot be added to the cart"),
    },
  },
  CartLine: {
    description: "One line in the cart.",
    fields: {
      productId: req(str("Product id")),
      name: req(str("Product name")),
      price: req(num("Unit price")),
      qty: req(num("Quantity (1 or more)")),
      image: image("Product photo"),
    },
  },
  Service: {
    description: "Something a customer can book.",
    fields: {
      id: req(str("Stable id, lowercase-with-dashes")),
      name: req(str("Service name")),
      description: text("Short description"),
      durationMin: req(num("How long it takes, in minutes")),
      price: num("Price in the site currency (leave out for free)"),
    },
  },
  Slot: {
    description: "One bookable time on the chosen day.",
    fields: {
      id: req(str("Start time as 'HH:MM'")),
      label: req(str("Text shown, e.g. '10:30 AM'")),
      available: req(bool("False = already taken or in the past")),
    },
  },
  UserSummary: {
    description: "The signed-in user.",
    fields: { name: req(str("Full name")), email: req(str("Email")), avatarUrl: image("Photo"), role: str("Role label") },
  },
  FieldDef: {
    description: "One form field (from the portal config).",
    fields: {
      key: req(str("Column key, e.g. 'due_date'")),
      label: req(str("Label shown")),
      type: req(oneOf([...FIELD_TYPE_NAMES], "Field type")),
      required: req(bool("Must be filled")),
      options: list(str("Option"), "Choices for select-like types"),
      width: oneOf(["full", "half", "third"], "Layout width"),
      placeholder: str("Placeholder text"),
      helpText: str("Hint under the field"),
    },
  },
  Column: {
    description: "One table column.",
    fields: {
      key: req(str("Field key")),
      label: req(str("Header text")),
      type: oneOf([...FIELD_TYPE_NAMES], "Field type, for formatting cells"),
      sortable: bool("Can sort by this column"),
    },
  },
  SortState: {
    description: "Current sort.",
    fields: { key: req(str("Column key")), dir: req(oneOf(["asc", "desc"], "Direction")) },
  },
  PageState: {
    description: "Current page of a list.",
    fields: { page: req(num("1-based page")), pageSize: req(num("Rows per page")), total: req(num("Total rows")) },
  },
  RowAction: {
    description: "An action button on a table row.",
    fields: {
      id: req(oneOf(["view", "edit", "delete"], "Action")),
      label: req(str("Text / tooltip")),
      onSelect: req(fn("(row: Record<string, unknown>) => void", "Called with the row")),
    },
  },
  FilterDef: {
    description: "A filter dropdown.",
    fields: { key: req(str("Field key")), label: req(str("Label")), options: req(list(str("Option"), "Choices")) },
  },
  ChartPoint: {
    description: "One point / bar / slice.",
    fields: { label: req(str("Label")), value: req(num("Value")) },
  },
  ActivityItem: {
    description: "One activity-log entry.",
    fields: { actor: req(str("Who")), action: req(str("What they did")), target: str("On what"), at: req(date("When (ISO)")) },
  },
  NotificationItem: {
    description: "One notification.",
    fields: { id: req(str("Id")), title: req(str("Title")), body: text("Details"), at: req(date("When (ISO)")), read: req(bool("Already read")) },
  },
  SettingsSection: {
    description: "A group of settings fields.",
    fields: { id: req(str("Section id")), title: req(str("Section title")), fields: req(list(shape("FieldDef"), "Fields")) },
  },
};

// Common props for anything that submits.
const busy = bool("True while saving / sending");
const errorMsg = str("Error message to show, if any");

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------
export const ROOMS = {
  // ----- shared by every website ------------------------------------------
  navbar: {
    kind: "visual",
    category: "layout",
    description: "Top navigation bar with brand, links and an optional button.",
    props: {
      brand: req(shape("Brand", "Site name / logo")),
      links: req(list(shape("NavLink"), "Menu links")),
      cta: shape("Cta", "Optional highlighted button"),
    },
  },
  footer: {
    kind: "visual",
    category: "layout",
    description: "Page footer with brand, short text, links and copyright.",
    props: {
      brand: req(shape("Brand", "Site name / logo")),
      text: str("Short line under the brand"),
      links: list(shape("NavLink"), "Footer links"),
      socialLinks: list(shape("SocialLink"), "Social / contact icons"),
      copyright: req(str("Copyright line")),
    },
  },
  "not-found": {
    kind: "visual",
    category: "feedback",
    description: "404 page.",
    props: { title: req(str("Heading")), message: req(text("Explanation")), homeHref: req(url("Link back home")) },
  },

  // ----- portfolio & landing content --------------------------------------
  hero: {
    kind: "visual",
    category: "content",
    description: "First big section: headline, sub-text, buttons, optional image.",
    props: {
      eyebrow: str("Small label above the title"),
      title: req(str("Main headline")),
      highlight: str("Part of the title to emphasise"),
      subtitle: text("Supporting text"),
      primaryCta: shape("Cta", "Main button"),
      secondaryCta: shape("Cta", "Second button"),
      image: shape("ImageRef", "Hero image"),
    },
  },
  about: {
    kind: "visual",
    category: "content",
    description: "About section: heading, paragraph, photo and highlights.",
    props: {
      heading: req(str("Section title")),
      body: req(text("Paragraph(s)")),
      image: shape("ImageRef", "Photo"),
      highlights: list(shape("Stat"), "Small facts next to the text"),
    },
  },
  projects: {
    kind: "visual",
    category: "content",
    description: "Grid or list of portfolio projects.",
    props: { heading: req(str("Section title")), items: req(list(shape("Project"), "Projects")) },
  },
  skills: {
    kind: "visual",
    category: "content",
    description: "Skills grouped by area.",
    props: { heading: req(str("Section title")), groups: req(list(shape("SkillGroup"), "Skill groups")) },
  },
  experience: {
    kind: "visual",
    category: "content",
    description: "Work experience timeline.",
    props: { heading: req(str("Section title")), items: req(list(shape("TimelineItem"), "Jobs")) },
  },
  education: {
    kind: "visual",
    category: "content",
    description: "Education timeline.",
    props: { heading: req(str("Section title")), items: req(list(shape("TimelineItem"), "Degrees")) },
  },
  services: {
    kind: "visual",
    category: "content",
    description: "Services / features grid with icons.",
    props: { heading: req(str("Section title")), subtitle: text("Intro text"), items: req(list(shape("Feature"), "Items")) },
  },
  stats: {
    kind: "visual",
    category: "content",
    description: "Row of big numbers.",
    props: { items: req(list(shape("Stat"), "Numbers")) },
  },
  testimonials: {
    kind: "visual",
    category: "content",
    description: "Quotes from clients or colleagues.",
    props: { heading: req(str("Section title")), items: req(list(shape("Testimonial"), "Quotes")) },
  },
  "resume-download": {
    kind: "visual",
    category: "content",
    description: "Button / card to download a CV.",
    props: { label: req(str("Button text")), href: req(url("PDF link")), note: str("Small note, e.g. 'Updated May 2026'") },
  },
  contact: {
    kind: "visual",
    category: "content",
    description: "Contact details (email, phone, profiles) without a form.",
    props: {
      heading: req(str("Section title")),
      text: text("Intro text"),
      links: req(list(shape("SocialLink"), "Ways to reach")),
      availability: str("e.g. 'Open to work'"),
    },
  },
  "contact-form": {
    kind: "workflow",
    category: "form",
    description: "Name / email / message form. The shell sends it; the component only shows it.",
    props: {
      heading: req(str("Section title")),
      text: text("Intro text"),
      onSubmit: req(fn("(values: { name: string; email: string; message: string }) => Promise<void>", "Send the message")),
      submitting: req(busy),
      sent: req(bool("Show the 'thank you' state")),
      error: errorMsg,
    },
  },
  pricing: {
    kind: "visual",
    category: "content",
    description: "Pricing plans side by side.",
    props: { heading: req(str("Section title")), subtitle: text("Intro text"), plans: req(list(shape("PricingPlan"), "Plans")) },
  },
  faq: {
    kind: "visual",
    category: "content",
    description: "Questions and answers (accordion or list).",
    props: { heading: req(str("Section title")), items: req(list(shape("FaqItem"), "Questions")) },
  },
  team: {
    kind: "visual",
    category: "content",
    description: "Team member cards.",
    props: { heading: req(str("Section title")), members: req(list(shape("TeamMember"), "People")) },
  },
  gallery: {
    kind: "visual",
    category: "content",
    description: "Image gallery.",
    props: { heading: req(str("Section title")), images: req(list(shape("ImageRef"), "Images")) },
  },
  "location-map": {
    kind: "visual",
    category: "content",
    description: "Address with an embedded map.",
    props: {
      heading: req(str("Section title")),
      address: req(text("Full address")),
      mapEmbedUrl: url("Google Maps / OpenStreetMap embed URL"),
      hours: list(str("e.g. 'Mon–Sat 9am–7pm'"), "Opening hours"),
    },
  },
  "cta-banner": {
    kind: "visual",
    category: "content",
    description: "Wide banner with a title and a button.",
    props: { title: req(str("Banner title")), subtitle: text("Supporting text"), cta: req(shape("Cta", "Button")) },
  },
  newsletter: {
    kind: "workflow",
    category: "form",
    description: "Email signup box.",
    props: {
      heading: req(str("Title")),
      text: text("Why subscribe"),
      onSubscribe: req(fn("(email: string) => Promise<void>", "Save the email")),
      submitting: req(busy),
      done: req(bool("Show the success state")),
      error: errorMsg,
    },
  },

  // ----- admin portal: auth -----------------------------------------------
  login: {
    kind: "workflow",
    category: "auth",
    description: "Login screen with side panel copy. The shell does the actual sign-in.",
    props: {
      brand: req(shape("Brand", "Portal name / logo")),
      badge: str("Small label"),
      headline: req(str("Side-panel headline")),
      description: text("Side-panel text"),
      features: list(shape("Feature"), "Selling points on the side panel"),
      onSubmit: req(fn("(email: string, password: string) => Promise<void>", "Sign in")),
      submitting: req(busy),
      error: errorMsg,
      signupHref: url("Show a 'create account' link"),
      forgotPasswordHref: url("Show a 'forgot password' link"),
    },
  },
  signup: {
    kind: "workflow",
    category: "auth",
    description: "Create-account screen.",
    props: {
      brand: req(shape("Brand", "Portal name / logo")),
      onSubmit: req(fn("(values: { name: string; email: string; password: string }) => Promise<void>", "Create the account")),
      submitting: req(busy),
      error: errorMsg,
      loginHref: req(url("Link back to login")),
    },
  },
  "forgot-password": {
    kind: "workflow",
    category: "auth",
    description: "Request a password-reset email.",
    props: {
      brand: req(shape("Brand", "Portal name / logo")),
      onSubmit: req(fn("(email: string) => Promise<void>", "Send reset email")),
      submitting: req(busy),
      sent: req(bool("Show the 'check your inbox' state")),
      error: errorMsg,
      loginHref: req(url("Link back to login")),
    },
  },

  // ----- admin portal: frame & dashboard ----------------------------------
  "app-frame": {
    kind: "visual",
    category: "layout",
    description: "Signed-in layout: sidebar or topbar navigation, user menu, page content.",
    props: {
      brand: req(shape("Brand", "Portal name / logo")),
      navItems: req(list(shape("NavLink"), "Menu (dashboard, modules, profile…)")),
      user: req(shape("UserSummary", "Signed-in user")),
      onLogout: req(fn("() => void", "Sign out")),
      pageTitle: str("Title of the current page"),
      children: req(node("The page content")),
    },
  },
  "dashboard-stat-card": {
    kind: "visual",
    category: "data",
    description: "One KPI tile (e.g. 'Patients: 128').",
    props: {
      label: req(str("What is counted")),
      value: req(str("Formatted value")),
      icon: icon("Icon name"),
      trend: num("Change in %, positive or negative"),
      hint: str("Small note under the value"),
      href: url("Open the related page"),
    },
  },
  "dashboard-chart": {
    kind: "visual",
    category: "data",
    description: "One chart (bar, line or pie).",
    props: {
      title: req(str("Chart title")),
      variant: req(oneOf(["bar", "line", "pie"], "Chart type")),
      data: req(list(shape("ChartPoint"), "Points")),
      valueFormat: oneOf(["number", "currency", "percent"], "How to format values"),
      loading: bool("Show a skeleton"),
    },
  },

  // ----- admin portal: data pages -----------------------------------------
  "data-table": {
    kind: "workflow",
    category: "data",
    description: "List of records with sorting, paging and row actions. Data comes from the shell.",
    props: {
      columns: req(list(shape("Column"), "Columns")),
      rows: req(list(record("One record"), "Records on this page")),
      loading: req(bool("Show a skeleton")),
      sort: shape("SortState", "Current sort"),
      onSortChange: fn("(sort: SortState) => void", "User changed the sort"),
      page: req(shape("PageState", "Paging info")),
      onPageChange: req(fn("(page: number, pageSize: number) => void", "User changed page")),
      rowActions: list(shape("RowAction"), "Buttons per row"),
      onRowClick: fn("(row: Record<string, unknown>) => void", "Row clicked"),
      emptyText: str("Text when there are no rows"),
    },
  },
  "filter-bar": {
    kind: "workflow",
    category: "data",
    description: "Search box and filter dropdowns above a table.",
    props: {
      search: req(str("Current search text")),
      onSearchChange: req(fn("(value: string) => void", "Search changed")),
      filters: req(list(shape("FilterDef"), "Available filters")),
      values: req(record("Selected value per filter key")),
      onFilterChange: req(fn("(key: string, value: string | null) => void", "A filter changed")),
      onReset: fn("() => void", "Clear everything"),
    },
  },
  "form-field": {
    kind: "workflow",
    category: "form",
    description: "ONE input for one field type (text, currency, date…). Each component declares which field types it supports.",
    props: {
      field: req(shape("FieldDef", "The field from the config")),
      value: req(anyValue("Current value (its type depends on the field type)")),
      onChange: req(fn("(value: unknown) => void", "Value changed")),
      error: errorMsg,
      disabled: bool("Read-only"),
    },
  },
  "record-form": {
    kind: "workflow",
    category: "form",
    description: "Add / edit form for one record. Lays out the fields; each field is drawn by a form-field component.",
    props: {
      title: req(str("e.g. 'Add Patient'")),
      fields: req(list(shape("FieldDef"), "Fields")),
      values: req(record("Current values")),
      errors: req(record("Error per field key")),
      onChange: req(fn("(key: string, value: unknown) => void", "A field changed")),
      onSubmit: req(fn("() => Promise<void>", "Save")),
      onCancel: req(fn("() => void", "Cancel")),
      submitting: req(busy),
      renderField: req(fn("(field: FieldDef) => ReactNode", "Draws one field using the chosen form-field components")),
    },
  },
  "record-detail": {
    kind: "visual",
    category: "data",
    description: "Read-only view of one record.",
    props: {
      title: req(str("Record title")),
      fields: req(list(shape("FieldDef"), "Fields")),
      record: req(record("The record")),
      onEdit: fn("() => void", "Go to edit"),
      onDelete: fn("() => void", "Ask to delete"),
    },
  },
  "confirm-dialog": {
    kind: "workflow",
    category: "feedback",
    description: "'Are you sure?' dialog.",
    props: {
      open: req(bool("Visible")),
      title: req(str("Question")),
      message: text("Details"),
      confirmLabel: req(str("e.g. 'Delete'")),
      danger: bool("Red confirm button"),
      busy: bool("Confirm in progress"),
      onConfirm: req(fn("() => void", "Confirmed")),
      onCancel: req(fn("() => void", "Cancelled")),
    },
  },
  "empty-state": {
    kind: "visual",
    category: "feedback",
    description: "Shown when a list has no records yet.",
    props: {
      title: req(str("e.g. 'No patients yet'")),
      message: text("Help text"),
      icon: icon("Icon name"),
      actionLabel: str("Button text"),
      onAction: fn("() => void", "Button clicked"),
    },
  },
  "export-button": {
    kind: "workflow",
    category: "data",
    description: "Export the current list (e.g. to Excel). The shell builds the file.",
    props: { label: req(str("Button text")), onExport: req(fn("() => Promise<void>", "Create the file")), busy: req(busy) },
  },
  profile: {
    kind: "workflow",
    category: "form",
    description: "The signed-in user's profile page.",
    props: {
      user: req(shape("UserSummary", "Current user")),
      fields: req(list(shape("FieldDef"), "Editable fields")),
      values: req(record("Current values")),
      onSave: req(fn("(values: Record<string, unknown>) => Promise<void>", "Save changes")),
      saving: req(busy),
      error: errorMsg,
    },
  },
  settings: {
    kind: "workflow",
    category: "form",
    description: "Settings page made of sections.",
    props: {
      sections: req(list(shape("SettingsSection"), "Sections")),
      values: req(record("Current values by field key")),
      onSave: req(fn("(values: Record<string, unknown>) => Promise<void>", "Save")),
      saving: req(busy),
      error: errorMsg,
    },
  },
  "users-roles": {
    kind: "workflow",
    category: "data",
    description: "Manage portal users and their roles.",
    props: {
      users: req(list(shape("UserSummary"), "Users")),
      roles: req(list(str("Role name"), "Available roles")),
      onInvite: req(fn("(email: string, role: string) => Promise<void>", "Invite a user")),
      onRoleChange: req(fn("(email: string, role: string) => Promise<void>", "Change a role")),
      busy: req(busy),
      error: errorMsg,
    },
  },
  "file-upload": {
    kind: "workflow",
    category: "form",
    description: "Drop zone / picker for files. The shell uploads them.",
    props: {
      accept: str("Allowed types, e.g. 'image/*,.pdf'"),
      multiple: bool("Allow many files"),
      maxSizeMb: num("Size limit per file"),
      onUpload: req(fn("(files: File[]) => Promise<void>", "Upload")),
      uploading: req(busy),
      error: errorMsg,
    },
  },
  notifications: {
    kind: "visual",
    category: "feedback",
    description: "Bell menu or panel with notifications.",
    props: {
      items: req(list(shape("NotificationItem"), "Notifications")),
      onMarkRead: req(fn("(id: string) => void", "Mark one as read")),
      onMarkAllRead: fn("() => void", "Mark all as read"),
    },
  },
  "activity-log": {
    kind: "visual",
    category: "data",
    description: "Recent activity list.",
    props: { heading: req(str("Title")), items: req(list(shape("ActivityItem"), "Entries")), loading: bool("Show a skeleton") },
  },

  // ----- e-commerce (the shell keeps the cart, orders and payment) ---------
  "product-list": {
    kind: "workflow",
    category: "commerce",
    description: "Grid of products with an 'Add to cart' button on each.",
    props: {
      heading: req(str("Section title")),
      subtitle: text("Intro text"),
      products: req(list(shape("Product"), "Products on sale")),
      currency: req(str("Currency code, e.g. INR")),
      productHref: req(fn("(productId: string) => string", "Link to a product's own page")),
      onAdd: req(fn("(productId: string) => void", "Put one in the cart")),
    },
  },
  "product-page": {
    kind: "workflow",
    category: "commerce",
    description: "One product in detail with price, description and 'Add to cart'.",
    props: {
      product: req(shape("Product", "The product shown")),
      currency: req(str("Currency code, e.g. INR")),
      inCart: req(num("How many of this product are already in the cart")),
      onAdd: req(fn("(productId: string) => void", "Put one in the cart")),
      backHref: req(url("Link back to the product list")),
      cartHref: req(url("Link to the cart")),
    },
  },
  cart: {
    kind: "workflow",
    category: "commerce",
    description: "The cart: lines, quantity buttons, total and a 'Checkout' button.",
    props: {
      heading: req(str("Section title")),
      lines: req(list(shape("CartLine"), "What is in the cart")),
      currency: req(str("Currency code, e.g. INR")),
      subtotal: req(num("Total of all lines")),
      onQty: req(fn("(productId: string, qty: number) => void", "Change a quantity (0 removes it)")),
      onRemove: req(fn("(productId: string) => void", "Remove a line")),
      checkoutHref: req(url("Link to checkout")),
      shopHref: req(url("Link back to the shop")),
    },
  },
  "checkout-payment": {
    kind: "workflow",
    category: "commerce",
    description: "Customer details and payment. The shell talks to the payment gateway; the component only shows the form.",
    props: {
      heading: req(str("Section title")),
      lines: req(list(shape("CartLine"), "What is being bought")),
      currency: req(str("Currency code, e.g. INR")),
      total: req(num("Amount to pay")),
      mode: req(oneOf(["test", "razorpay", "stripe"], "'test' = practice cards only; others use the server's payment function")),
      onPay: req(
        fn(
          "(details: { name: string; email: string; phone: string; address: string; cardNumber?: string; cardExpiry?: string; cardCvc?: string }) => Promise<void>",
          "Pay for the order"
        )
      ),
      paying: req(bool("True while the payment is in progress")),
      error: errorMsg,
      backHref: req(url("Link back to the cart")),
    },
  },
  "order-confirmation": {
    kind: "workflow",
    category: "commerce",
    description: "'Thank you' page after a paid order.",
    props: {
      heading: req(str("Section title")),
      orderId: req(str("Order number")),
      total: req(num("Amount paid")),
      currency: req(str("Currency code, e.g. INR")),
      email: str("Where the receipt goes"),
      lines: req(list(shape("CartLine"), "What was bought")),
      continueHref: req(url("Link back to the shop")),
    },
  },

  // ----- booking (the shell keeps the choices, slots and the booking) ------
  "services-list": {
    kind: "workflow",
    category: "booking",
    description: "The services a customer can book; they pick one.",
    props: {
      heading: req(str("Section title")),
      subtitle: text("Intro text"),
      services: req(list(shape("Service"), "Bookable services")),
      currency: req(str("Currency code, e.g. INR")),
      selectedId: str("Id of the chosen service"),
      onSelect: req(fn("(serviceId: string) => void", "Choose a service")),
    },
  },
  "slot-picker": {
    kind: "workflow",
    category: "booking",
    description: "Pick a day and a free time.",
    props: {
      heading: req(str("Section title")),
      serviceName: str("The chosen service, or empty if none yet"),
      date: req(str("Chosen day as YYYY-MM-DD")),
      minDate: req(str("Earliest day allowed")),
      maxDate: req(str("Latest day allowed")),
      slots: req(list(shape("Slot"), "Times on the chosen day")),
      selectedSlotId: str("Chosen time ('HH:MM')"),
      closedMessage: str("Shown when the day has no times"),
      onDateChange: req(fn("(date: string) => void", "Choose a day")),
      onSelect: req(fn("(slotId: string) => void", "Choose a time")),
    },
  },
  "booking-form": {
    kind: "workflow",
    category: "booking",
    description: "Name, email and phone to finish the booking. The shell saves it.",
    props: {
      heading: req(str("Section title")),
      summary: str("One line: what is being booked and when"),
      ready: req(bool("False until a service and a time are chosen")),
      onSubmit: req(fn("(values: { name: string; email: string; phone: string; notes: string }) => Promise<void>", "Book it")),
      submitting: req(busy),
      error: errorMsg,
    },
  },
  "booking-confirmation": {
    kind: "workflow",
    category: "booking",
    description: "'You are booked' page with the reference number.",
    props: {
      heading: req(str("Section title")),
      reference: req(str("Booking reference")),
      serviceName: req(str("What was booked")),
      whenLabel: req(str("When, in words")),
      name: str("Who booked"),
      email: str("Where the confirmation goes"),
      homeHref: req(url("Link back home")),
    },
  },
};

export const ROOM_IDS = Object.freeze(Object.keys(ROOMS));
