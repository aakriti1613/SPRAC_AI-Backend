// Profile, settings and users pages (rooms: profile, settings, users-roles).
import { useState } from "react";
import type { FieldDef } from "@contracts";
import { Slot } from "@core/slots";
import { useSettings, useUsers } from "../logic/hooks";
import { messageOf, useSession } from "../logic/portal";
import { Frame, PageHeader } from "./Frame";

const PROFILE_FIELDS: FieldDef[] = [
  { key: "name", label: "Full name", type: "text", required: true, width: "half" },
  { key: "avatar_url", label: "Photo URL", type: "url", required: false, width: "half", placeholder: "https://…" },
];

export function ProfilePage() {
  const { user, updateProfile } = useSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Frame title="My profile">
      <PageHeader title="My profile" />
      <Slot
        room="profile"
        props={{
          user: { name: user?.name ?? "", email: user?.email ?? "", avatarUrl: user?.avatarUrl, role: user?.role },
          fields: PROFILE_FIELDS,
          values: { name: user?.name ?? "", avatar_url: user?.avatarUrl ?? "" },
          saving,
          error,
          onSave: async (values) => {
            const name = String(values.name ?? "").trim();
            if (!name) {
              setError("Full name is required.");
              return;
            }
            setSaving(true);
            setError(undefined);
            try {
              await updateProfile({ name, avatarUrl: String(values.avatar_url ?? "") });
            } catch (e) {
              setError(messageOf(e));
            } finally {
              setSaving(false);
            }
          },
        }}
      />
    </Frame>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  return (
    <Frame title="Settings">
      <PageHeader title="Settings" subtitle="Saved in this browser." />
      <Slot
        room="settings"
        props={{ sections: settings.sections, values: settings.values, onSave: settings.save, saving: settings.saving, error: settings.error }}
      />
    </Frame>
  );
}

export function UsersPage() {
  const u = useUsers();
  return (
    <Frame title="Users & roles">
      <PageHeader title="Users & roles" />
      <Slot
        room="users-roles"
        props={{ users: u.users, roles: u.roles, onInvite: u.invite, onRoleChange: u.changeRole, busy: u.busy, error: u.error }}
      />
    </Frame>
  );
}
