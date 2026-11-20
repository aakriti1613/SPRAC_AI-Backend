// Module pages, one set per module: list, add, edit, details.
// Rooms: filter-bar, data-table, empty-state, export-button, confirm-dialog,
//        record-form, form-field, file-upload, record-detail.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { FieldDef } from "@contracts";
import type { PortalModule } from "@core/config";
import { Icon } from "@core/icons";
import { FieldSlot, Slot } from "@core/slots";
import { buttonClass } from "@core/ui";
import { displayName, useCrudList, useExport, useRecord, useRecordForm } from "../logic/hooks";
import { messageOf, usePortal } from "../logic/portal";
import { ErrorNote, Frame, PageHeader } from "./Frame";
import { NotFoundPage } from "./NotFoundPage";

const FILE_TYPES = new Set(["file", "image", "avatar"]);

/** Resolves :module from the URL; unknown modules show the 404 page. */
export function ModuleRoute({ page }: { page: "list" | "new" | "edit" | "detail" }) {
  const { module: moduleId, id } = useParams();
  const { moduleById } = usePortal();
  const module = moduleById(moduleId);
  if (!module) return <NotFoundPage />;
  const key = `${module.id}:${id ?? ""}`;
  if (page === "list") return <ModuleListPage key={key} module={module} />;
  if (page === "detail") return <ModuleDetailPage key={key} module={module} id={id!} />;
  return <ModuleFormPage key={key} module={module} id={page === "edit" ? id : undefined} />;
}

function DeleteDialog({ module, name, open, busy, onConfirm, onCancel }: { module: PortalModule; name: string; open: boolean; busy: boolean; onConfirm(): void; onCancel(): void }) {
  return (
    <Slot
      room="confirm-dialog"
      props={{
        open,
        title: `Delete this ${module.singularName.toLowerCase()}?`,
        message: `“${name}” will be removed permanently.`,
        confirmLabel: "Delete",
        danger: true,
        busy,
        onConfirm,
        onCancel,
      }}
    />
  );
}

function ExportButton({ module }: { module: PortalModule }) {
  const exp = useExport(module);
  return <Slot room="export-button" props={{ label: "Export CSV", busy: exp.busy, onExport: async () => void (await exp.run()) }} />;
}

function ModuleListPage({ module }: { module: PortalModule }) {
  const { enabled } = usePortal();
  const navigate = useNavigate();
  const list = useCrudList(module);
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();
  const showEmpty = !list.loading && !list.error && list.total === 0 && !list.isFiltered;
  const features = module.tableFeatures;

  return (
    <Frame title={module.pluralName}>
      <PageHeader
        title={module.pluralName}
        subtitle={list.loading ? "Loading…" : `${list.total} ${list.total === 1 ? "record" : "records"}`}
        actions={
          <>
            {enabled.has("export-button") && features.export && <ExportButton module={module} />}
            <Link to={`/${module.id}/new`} className={buttonClass("primary")}>
              <Icon name="Plus" /> Add {module.singularName.toLowerCase()}
            </Link>
          </>
        }
      />
      <ErrorNote message={list.error ?? error} />
      {(features.search || list.filterDefs.length > 0) && !showEmpty && (
        <div className="mb-4">
          <Slot
            room="filter-bar"
            props={{
              search: list.search,
              onSearchChange: list.setSearch,
              filters: list.filterDefs,
              values: list.filters,
              onFilterChange: list.setFilter,
              onReset: list.resetFilters,
            }}
          />
        </div>
      )}
      {showEmpty ? (
        <Slot
          room="empty-state"
          props={{
            title: `No ${module.pluralName.toLowerCase()} yet`,
            message: `Add your first ${module.singularName.toLowerCase()} to see it here.`,
            icon: module.icon,
            actionLabel: `Add ${module.singularName.toLowerCase()}`,
            onAction: () => navigate(`/${module.id}/new`),
          }}
        />
      ) : (
        <Slot
          room="data-table"
          props={{
            columns: list.columns,
            rows: list.rows,
            loading: list.loading,
            sort: list.sort,
            onSortChange: list.setSort,
            page: list.page,
            onPageChange: list.setPage,
            emptyText: list.isFiltered ? "No records match your search." : "Nothing here yet.",
            onRowClick: (row) => navigate(`/${module.id}/${String(row.id)}`),
            rowActions: [
              { id: "view", label: "View", onSelect: (row) => navigate(`/${module.id}/${String(row.id)}`) },
              { id: "edit", label: "Edit", onSelect: (row) => navigate(`/${module.id}/${String(row.id)}/edit`) },
              {
                id: "delete",
                label: "Delete",
                onSelect: (row) => setPending({ id: String(row.id), name: displayName(module, row as never) }),
              },
            ],
          }}
        />
      )}
      <DeleteDialog
        module={module}
        name={pending?.name ?? ""}
        open={Boolean(pending)}
        busy={deleting}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          setDeleting(true);
          try {
            await list.remove(pending.id);
            setPending(null);
          } catch (e) {
            setError(messageOf(e));
          } finally {
            setDeleting(false);
          }
        }}
      />
    </Frame>
  );
}

function FileField({ field, value, onChange, error }: { field: FieldDef; value: unknown; onChange(v: unknown): void; error?: string }) {
  const { data } = usePortal();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const url = typeof value === "string" ? value : "";
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-fg">
        {field.label}
        {field.required && <span className="text-danger"> *</span>}
      </div>
      {url && (
        <div className="flex items-center gap-3 text-sm">
          {field.type !== "file" ? <img src={url} alt="" className="h-12 w-12 rounded-sparc object-cover" /> : null}
          <a href={url} target="_blank" rel="noreferrer" className="truncate text-primary underline">
            Current file
          </a>
          <button type="button" className="text-muted underline" onClick={() => onChange("")}>
            Remove
          </button>
        </div>
      )}
      <Slot
        room="file-upload"
        props={{
          accept: field.type === "file" ? undefined : "image/*",
          multiple: false,
          maxSizeMb: 5,
          uploading,
          error: uploadError ?? error,
          onUpload: async (files) => {
            if (!files[0]) return;
            setUploading(true);
            setUploadError(undefined);
            try {
              onChange(await data.upload(files[0]));
            } catch (e) {
              setUploadError(messageOf(e));
            } finally {
              setUploading(false);
            }
          },
        }}
      />
    </div>
  );
}

function ModuleFormPage({ module, id }: { module: PortalModule; id?: string }) {
  const { enabled } = usePortal();
  const navigate = useNavigate();
  const form = useRecordForm(module, id);
  const title = `${id ? "Edit" : "Add"} ${module.singularName.toLowerCase()}`;

  if (form.notFound) return <NotFoundPage />;
  return (
    <Frame title={title}>
      <PageHeader title={title} />
      <ErrorNote message={form.errors._form} />
      {form.loading ? (
        <div className="h-64 animate-pulse rounded-sparc bg-border/60" />
      ) : (
        <Slot
          room="record-form"
          props={{
            title,
            fields: module.fields,
            values: form.values,
            errors: form.errors,
            onChange: form.onChange,
            submitting: form.submitting,
            onCancel: () => navigate(id ? `/${module.id}/${id}` : `/${module.id}`),
            onSubmit: async () => {
              const saved = await form.submit();
              if (saved) navigate(`/${module.id}/${saved.id}`, { replace: true });
            },
            renderField: (field) =>
              FILE_TYPES.has(field.type) && enabled.has("file-upload") ? (
                <FileField field={field} value={form.values[field.key]} onChange={(v) => form.onChange(field.key, v)} error={form.errors[field.key]} />
              ) : (
                <FieldSlot field={field} value={form.values[field.key]} onChange={(v) => form.onChange(field.key, v)} error={form.errors[field.key]} disabled={form.submitting} />
              ),
          }}
        />
      )}
    </Frame>
  );
}

function ModuleDetailPage({ module, id }: { module: PortalModule; id: string }) {
  const navigate = useNavigate();
  const { record, loading, error, remove } = useRecord(module, id);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  if (!loading && !record && !error) return <NotFoundPage />;
  const name = record ? displayName(module, record) : "";
  return (
    <Frame title={name || module.singularName}>
      <PageHeader
        title={loading ? "Loading…" : name}
        subtitle={module.singularName}
        actions={
          <Link to={`/${module.id}`} className={buttonClass("outline")}>
            <Icon name="ChevronLeft" /> All {module.pluralName.toLowerCase()}
          </Link>
        }
      />
      <ErrorNote message={error ?? deleteError} />
      {record && (
        <Slot
          room="record-detail"
          props={{
            title: name,
            fields: module.fields,
            record,
            onEdit: () => navigate(`/${module.id}/${id}/edit`),
            onDelete: () => setConfirm(true),
          }}
        />
      )}
      <DeleteDialog
        module={module}
        name={name}
        open={confirm}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await remove();
            navigate(`/${module.id}`, { replace: true });
          } catch (e) {
            setDeleteError(messageOf(e));
            setConfirm(false);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Frame>
  );
}
