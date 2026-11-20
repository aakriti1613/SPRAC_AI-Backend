import { useState, type FormEvent } from "react";
import type { UsersRolesProps } from "@contracts";
import { Icon } from "@core/icons";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

export default function UsersRoles({ users, roles, onInvite, onRoleChange, busy, error }: UsersRolesProps) {
  const s = useSkin();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[roles.length - 1] ?? "");
  const invite = async (e: FormEvent) => {
    e.preventDefault();
    await onInvite(email.trim(), role);
    setEmail("");
  };
  return (
    <div className="space-y-6">
      <form onSubmit={invite} className={cn(s.card, "flex flex-wrap items-end gap-3 p-5")} aria-label="Add a user">
        <label className="min-w-[14rem] flex-1 text-sm text-fg">
          Email
          <input type="email" required className={cn(s.input, "mt-1.5")} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" />
        </label>
        <label className="text-sm text-fg">
          Role
          <select className={cn(s.input, "mt-1.5 w-40")} value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <button type="submit" className={s.button("primary")} disabled={busy}>
          <Icon name="Plus" /> Add user
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className={cn(s.card, "overflow-x-auto")}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-bg text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.email}>
                <td className="px-4 py-3 text-fg">{u.name}</td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-2">
                  <select
                    aria-label={`Role for ${u.email}`}
                    className={cn(s.input, "h-8 w-40 py-0")}
                    value={u.role ?? ""}
                    disabled={busy}
                    onChange={(e) => void onRoleChange(u.email, e.target.value)}
                  >
                    {[...new Set([u.role ?? "", ...roles])].filter(Boolean).map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
