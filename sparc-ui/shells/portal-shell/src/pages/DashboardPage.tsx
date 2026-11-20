// Dashboard page (rooms: dashboard-stat-card, dashboard-chart, activity-log).
import { Slot } from "@core/slots";
import { useDashboard, useRecentChanges } from "../logic/hooks";
import { usePortal } from "../logic/portal";
import { ErrorNote, Frame, PageHeader } from "./Frame";

function Activity() {
  const recent = useRecentChanges(10);
  return <Slot room="activity-log" props={{ heading: "Recent activity", items: recent.activity, loading: recent.loading }} />;
}

export function DashboardPage() {
  const { brand, enabled } = usePortal();
  const withChart = enabled.has("dashboard-chart");
  const { stats, chart, loading, error } = useDashboard(withChart);

  return (
    <Frame title="Dashboard">
      <PageHeader title="Dashboard" subtitle={`${brand.name} at a glance`} />
      <ErrorNote message={error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="stat-grid">
        {loading && !stats.length
          ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-sparc bg-border/60" />)
          : stats.map((s) => <Slot key={s.key} room="dashboard-stat-card" props={{ label: s.label, value: s.value, icon: s.icon, href: s.href }} />)}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {withChart && (
          <Slot room="dashboard-chart" props={{ title: chart?.title ?? "Overview", variant: "bar", data: chart?.data ?? [], loading }} />
        )}
        {enabled.has("activity-log") && <Activity />}
      </div>
    </Frame>
  );
}
