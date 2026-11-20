// Adapter: public Storybooks (index.json, Storybook 7+). Gives component names,
// story counts and tags — not props — so records stay shallow and link to the
// package that ships the component. Candidates only.
import { contentHash } from "../analyze/rules.js";

export const STORYBOOKS = [
  { id: "carbon-react", name: "IBM Carbon (React)", url: "https://react.carbondesignsystem.com", npm: "@carbon/react", license: "Apache-2.0" },
];

const ROOM_BY_NAME = {
  DataTable: "data-table",
  Modal: "confirm-dialog",
  ComposedModal: "confirm-dialog",
  Notification: "notifications",
  Notifications: "notifications",
  FileUploader: "file-upload",
  Search: "filter-bar",
  Pagination: "data-table",
  UIShell: "app-frame",
  DatePicker: "form-field",
  Dropdown: "form-field",
  Select: "form-field",
  TextInput: "form-field",
  Toggle: "form-field",
};

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();

export function storybookAdapter({ fetchJson, storybooks = STORYBOOKS }) {
  return {
    name: "storybook",
    async collect() {
      const items = [];
      for (const sb of storybooks) {
        const index = await fetchJson(`${sb.url}/index.json`);
        const byComponent = new Map();
        for (const e of Object.values(index.entries ?? {})) {
          const parts = String(e.title ?? "").split("/");
          if (parts[0] !== "Components" || !parts[1]) continue;
          const name = parts[1].replace(/\s+/g, "");
          const c = byComponent.get(name) ?? { name, stories: 0, docs: 0, tags: new Set(), firstId: e.id };
          if (e.type === "docs") c.docs += 1;
          else c.stories += 1;
          for (const t of e.tags ?? []) if (!["dev", "test", "autodocs", "attached-mdx", "unattached-mdx"].includes(t)) c.tags.add(t);
          byComponent.set(name, c);
        }
        for (const c of [...byComponent.values()].sort((a, b) => a.name.localeCompare(b.name))) {
          const room = ROOM_BY_NAME[c.name];
          items.push({
            idPrefix: "storybook",
            slug: `${sb.id}/${kebab(c.name)}`,
            version: "0.0.0",
            name: `${c.name} (${sb.name})`,
            kind: "ui",
            room,
            roomBy: "registry",
            summary: `${c.name} from ${sb.name}: ${c.stories} stories${c.docs ? ", documented" : ""}.`,
            source: { type: "storybook", url: `${sb.url}/?path=/story/${c.firstId}`, ref: sb.npm },
            contentHash: contentHash([{ path: `${sb.id}/${c.name}`, content: JSON.stringify({ stories: c.stories, docs: c.docs }) }]),
            requires: { npm: { [sb.npm]: "*" }, peer: {}, registry: [], env: [] },
            requiresBy: "registry",
            facets: { category: room ?? "ui", tags: [sb.id, ...[...c.tags].slice(0, 6)] },
            license: sb.license,
            licenseBy: "human",
            quality: { hasTests: c.stories > 0 },
            eligibleForVerified: false,
          });
        }
      }
      return items;
    },
  };
}
