/**
 * Superadmin dashboard for tree-plan management.
 * Tabs: Plans | Subscriptions | Audit Log | Sachet Analytics | GST Report.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  adminListPlans, adminUpdatePlan, adminDeletePlan,
  adminListSubscriptions, adminEventLog, adminSachetAnalytics,
  adminGstReport, adminApplyOverride, adminReferralUnlocks,
  type TreePlan,
} from "@/services/entitlementApi";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

const isSuperadmin = (role?: string) => role === "admin" || role === "superadmin";

const TreePackagesPage: React.FC = () => {
  const { appUser, loading: authLoading } = useAuth();

  if (authLoading) {
    return <div className="p-12 text-center text-muted-foreground">Checking permissions…</div>;
  }
  if (!isSuperadmin(appUser?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Tree Plans · Superadmin</h1>
        <p className="text-sm text-muted-foreground">
          Manage tree-visibility plan catalog, subscribers, audit log, sachet
          analytics, and GST reports.
        </p>
      </div>

      <Tabs defaultValue="plans">
        <TabsList className="mb-4">
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="subs">Subscriptions</TabsTrigger>
          <TabsTrigger value="events">Audit log</TabsTrigger>
          <TabsTrigger value="sachets">Sachet analytics</TabsTrigger>
          <TabsTrigger value="gst">GST report</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
        </TabsList>

        <TabsContent value="plans"><PlansTab /></TabsContent>
        <TabsContent value="subs"><SubscriptionsTab /></TabsContent>
        <TabsContent value="events"><AuditLogTab /></TabsContent>
        <TabsContent value="sachets"><SachetAnalyticsTab /></TabsContent>
        <TabsContent value="gst"><GstReportTab /></TabsContent>
        <TabsContent value="referrals"><ReferralsTab /></TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Plans tab ──────────────────────────────────────────────────────────────

const PlansTab: React.FC = () => {
  const [plans, setPlans] = useState<TreePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, Partial<TreePlan>>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminListPlans();
      setPlans(res.plans);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const setField = (id: string, field: keyof TreePlan, value: unknown) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const savePlan = async (plan: TreePlan) => {
    const changes = editing[plan.id];
    if (!changes || Object.keys(changes).length === 0) return;
    try {
      await adminUpdatePlan(plan.id, changes);
      toast.success("Saved");
      setEditing((prev) => { const n = { ...prev }; delete n[plan.id]; return n; });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const deactivatePlan = async (plan: TreePlan) => {
    if (!confirm(`Deactivate plan "${plan.display_name}"?`)) return;
    try {
      await adminDeletePlan(plan.id);
      toast.success("Plan deactivated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deactivate failed");
    }
  };

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Display</TableHead>
            <TableHead>₹/mo</TableHead>
            <TableHead>₹/yr</TableHead>
            <TableHead>Gen up</TableHead>
            <TableHead>Gen down</TableHead>
            <TableHead>Max nodes</TableHead>
            <TableHead>Active</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((p) => {
            const e = editing[p.id] ?? {};
            return (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.name}</TableCell>
                <TableCell>
                  <Input className="h-7 w-32"
                    defaultValue={p.display_name}
                    onChange={(ev) => setField(p.id, "display_name", ev.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input type="number" className="h-7 w-20"
                    defaultValue={p.price_inr_monthly}
                    onChange={(ev) => setField(p.id, "price_inr_monthly", parseFloat(ev.target.value))}
                  />
                </TableCell>
                <TableCell>
                  <Input type="number" className="h-7 w-24"
                    defaultValue={p.price_inr_annual}
                    onChange={(ev) => setField(p.id, "price_inr_annual", parseFloat(ev.target.value))}
                  />
                </TableCell>
                <TableCell className="font-mono">{p.gen_up}</TableCell>
                <TableCell className="font-mono">{p.gen_down}</TableCell>
                <TableCell className="font-mono">{p.max_intentional_nodes}</TableCell>
                <TableCell>
                  {p.is_active ? <Badge>active</Badge> : <Badge variant="outline">disabled</Badge>}
                </TableCell>
                <TableCell className="flex gap-1">
                  <Button size="sm" onClick={() => savePlan(p)}
                          disabled={!Object.keys(e).length}>Save</Button>
                  {p.is_active && (
                    <Button size="sm" variant="destructive" onClick={() => deactivatePlan(p)}>
                      Off
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="p-3 text-xs text-muted-foreground border-t">
        Note: gen_up / gen_down / max_intentional_nodes are <strong>frozen</strong> if any
        active subscriber exists. Create a new plan instead of mutating limits.
      </div>
    </Card>
  );
};

// ─── Subscriptions tab ──────────────────────────────────────────────────────

const SubscriptionsTab: React.FC = () => {
  const [data, setData] = useState<{
    subscriptions: Array<Record<string, unknown> & {
      id: string; user_id: string; status: string; valid_until?: string;
      tree_plans?: { display_name?: string; name?: string };
    }>;
    total: number;
  }>({ subscriptions: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [overrideOpen, setOverrideOpen] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminListSubscriptions({ per_page: 50 });
      setData({ subscriptions: res.subscriptions as never, total: res.total });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Valid until</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.subscriptions.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-xs">{s.user_id.slice(0, 8)}…</TableCell>
              <TableCell>{s.tree_plans?.display_name ?? "—"}</TableCell>
              <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
              <TableCell className="text-xs">
                {s.valid_until ? new Date(s.valid_until).toLocaleDateString() : "—"}
              </TableCell>
              <TableCell>
                <Button size="sm" variant="outline"
                        onClick={() => setOverrideOpen(s.user_id)}>Override</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {overrideOpen && (
        <OverrideModal userId={overrideOpen} onClose={() => { setOverrideOpen(null); void load(); }} />
      )}
    </Card>
  );
};

// ─── Override modal ─────────────────────────────────────────────────────────

const OverrideModal: React.FC<{ userId: string; onClose: () => void }> = ({ userId, onClose }) => {
  const [genUp, setGenUp] = useState(2);
  const [genDown, setGenDown] = useState(2);
  const [maxNodes, setMaxNodes] = useState(51);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    if (reason.length < 3) { toast.error("Reason required (3+ chars)"); return; }
    setBusy(true);
    try {
      await adminApplyOverride(userId, {
        gen_up: genUp, gen_down: genDown, max_nodes: maxNodes, reason,
      });
      toast.success("Override applied");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="p-4 w-full max-w-md">
        <div className="font-bold mb-3">Apply manual override</div>
        <div className="space-y-3 text-sm">
          <div className="text-xs text-muted-foreground font-mono">user: {userId}</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs">Gen up</label>
              <Input type="number" value={genUp} onChange={(e) => setGenUp(+e.target.value)} />
            </div>
            <div>
              <label className="text-xs">Gen down</label>
              <Input type="number" value={genDown} onChange={(e) => setGenDown(+e.target.value)} />
            </div>
            <div>
              <label className="text-xs">Max nodes</label>
              <Input type="number" value={maxNodes} onChange={(e) => setMaxNodes(+e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs">Reason (audit log)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)}
                   placeholder="e.g. compensating support ticket #123" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={apply} disabled={busy}>Apply override</Button>
        </div>
      </Card>
    </div>
  );
};

// ─── Audit log tab ──────────────────────────────────────────────────────────

const AuditLogTab: React.FC = () => {
  const [events, setEvents] = useState<Array<Record<string, unknown> & {
    id: string; user_id: string; event_type: string; metadata: Record<string, unknown>;
    created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminEventLog({ event_type: filter || undefined, per_page: 100 });
      setEvents(res.events as never);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [filter]);

  return (
    <Card>
      <div className="p-3 border-b flex gap-2">
        <Input placeholder="filter by event_type (e.g. admin_override, subscribed)"
               value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Button onClick={load} disabled={loading}>Refresh</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Metadata</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((ev) => (
            <TableRow key={ev.id}>
              <TableCell className="text-xs">
                {new Date(ev.created_at).toLocaleString()}
              </TableCell>
              <TableCell className="font-mono text-xs">{ev.user_id.slice(0, 8)}…</TableCell>
              <TableCell><Badge variant="outline">{ev.event_type}</Badge></TableCell>
              <TableCell>
                <pre className="text-[10px] max-w-[400px] overflow-hidden truncate">
                  {JSON.stringify(ev.metadata)}
                </pre>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};

// ─── Sachet analytics tab ───────────────────────────────────────────────────

const SachetAnalyticsTab: React.FC = () => {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminSachetAnalytics>> | null>(null);
  useEffect(() => {
    adminSachetAnalytics()
      .then(setStats)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
  }, []);

  if (!stats) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Node unlocks</div>
        <div className="text-2xl font-bold">{stats.node_unlocks.total_count}</div>
        <div className="text-sm">₹{stats.node_unlocks.total_revenue_inr.toFixed(0)} revenue</div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Generation topups</div>
        <div className="text-2xl font-bold">{stats.topups.total_count}</div>
        <div className="text-sm">₹{stats.topups.total_revenue_inr.toFixed(0)} revenue</div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Active shares</div>
        <div className="text-2xl font-bold">{stats.shares.total_active}</div>
      </Card>
      <Card className="p-4 md:col-span-3">
        <div className="font-semibold mb-2">Most-unlocked nodes (top 25)</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Node ID</TableHead>
              <TableHead>Unlock count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.node_unlocks.top_unlocked_node_ids.map((r) => (
              <TableRow key={r.node_id}>
                <TableCell className="font-mono text-xs">{r.node_id}</TableCell>
                <TableCell>{r.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

// ─── GST report tab ─────────────────────────────────────────────────────────

const GstReportTab: React.FC = () => {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof adminGstReport>> | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await adminGstReport({ start_date: start || undefined, end_date: end || undefined });
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Report failed");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!data?.rows.length) return;
    const cols = Object.keys(data.rows[0]);
    const rows = [cols.join(",")];
    data.rows.forEach((r) => {
      rows.push(cols.map((c) => JSON.stringify(r[c] ?? "")).join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `gst-report-${start || "all"}-${end || "now"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4">
      <div className="flex gap-2 items-end mb-4">
        <div>
          <label className="text-xs">From</label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="text-xs">To</label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button onClick={run} disabled={busy}>Generate</Button>
        <Button variant="outline" onClick={exportCsv} disabled={!data?.rows.length}>
          Export CSV
        </Button>
      </div>
      {data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <Stat label="Rows" v={data.row_count} />
            <Stat label="Base ₹" v={data.totals.base_paise / 100} />
            <Stat label="CGST ₹" v={data.totals.cgst_paise / 100} />
            <Stat label="SGST ₹" v={data.totals.sgst_paise / 100} />
            <Stat label="IGST ₹" v={data.totals.igst_paise / 100} />
          </div>
        </div>
      )}
    </Card>
  );
};

const Stat: React.FC<{ label: string; v: number }> = ({ label, v }) => (
  <div className="p-2 border rounded">
    <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
    <div className="text-lg font-bold">{v.toLocaleString()}</div>
  </div>
);

// ─── Referrals tab ──────────────────────────────────────────────────────────

const ReferralsTab: React.FC = () => {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminReferralUnlocks>> | null>(null);
  useEffect(() => {
    adminReferralUnlocks()
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"));
  }, []);

  if (!data) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <Card>
      <div className="grid grid-cols-3 gap-4 p-4 border-b">
        <Stat label="Users with referrals" v={data.total_users} />
        <Stat label="Total +gen up granted" v={data.total_extra_up} />
        <Stat label="Total +gen down granted" v={data.total_extra_down} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Referrals</TableHead>
            <TableHead>+Gen up</TableHead>
            <TableHead>+Gen down</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((r) => (
            <TableRow key={r.user_id}>
              <TableCell className="font-mono text-xs">{r.user_id.slice(0, 8)}…</TableCell>
              <TableCell>{r.referrals_count}</TableCell>
              <TableCell>{r.extra_gen_up}</TableCell>
              <TableCell>{r.extra_gen_down}</TableCell>
              <TableCell className="text-xs">
                {new Date(r.updated_at).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};

export default TreePackagesPage;
