/**
 * /services/orders/:orderId — Service order detail page.
 *
 * Shows order status, care schedule milestones, and proof submissions.
 * Visible to the ordering user, their assigned vendor, and admins.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, Loader2, TreePine, FileImage, MapPin } from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import { fetchServiceOrderDetail, type ServiceOrder } from "@/services/api";

const STATUS_UI: Record<string, { label: string; color: string }> = {
  created:         { label: "बना", color: "bg-slate-100 text-slate-700" },
  paid:            { label: "भुगतान हुआ", color: "bg-blue-100 text-blue-700" },
  assigned:        { label: "Vendor मिला", color: "bg-indigo-100 text-indigo-700" },
  in_progress:     { label: "काम जारी है", color: "bg-amber-100 text-amber-700" },
  proof_submitted: { label: "प्रूफ अपलोड", color: "bg-purple-100 text-purple-700" },
  completed:       { label: "पूर्ण ✅", color: "bg-green-100 text-green-700" },
  cancelled:       { label: "रद्द", color: "bg-red-100 text-red-600" },
  disputed:        { label: "विवाद", color: "bg-orange-100 text-orange-700" },
};

const MILESTONE_STATUS_UI: Record<string, { icon: React.ReactNode; color: string }> = {
  pending:   { icon: <Clock className="w-3.5 h-3.5" />,         color: "text-amber-600" },
  notified:  { icon: <Clock className="w-3.5 h-3.5" />,         color: "text-blue-600" },
  completed: { icon: <CheckCircle2 className="w-3.5 h-3.5" />,  color: "text-green-600" },
};

export default function ServiceOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder]   = useState<ServiceOrder & { proof_submissions?: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    fetchServiceOrderDetail(orderId)
      .then(setOrder)
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> ऑर्डर लोड हो रहा है…
        </div>
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell>
        <div className="container py-16 text-center text-muted-foreground">
          <p>ऑर्डर नहीं मिला।</p>
          <button onClick={() => navigate("/services")} className="mt-4 text-sm text-green-600 hover:underline">
            सेवाओं पर वापस जाएं
          </button>
        </div>
      </AppShell>
    );
  }

  const ui = STATUS_UI[order.status] ?? { label: order.status, color: "bg-slate-100 text-slate-700" };
  const proofs = (order as { proof_submissions?: Record<string, unknown>[] }).proof_submissions ?? [];

  return (
    <AppShell>
      {/* Header */}
      <div className="relative gradient-hero text-primary-foreground py-6 overflow-hidden">
        <div className="container flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="hover:opacity-70 transition-opacity">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <TreePine className="w-5 h-5" />
              <h1 className="font-heading text-xl font-bold">
                {(order.service_packages as { name_english?: string })?.name_english ?? "Eco Service"}
              </h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ui.color}`}>{ui.label}</span>
            </div>
            <p className="text-xs opacity-70 mt-0.5">ऑर्डर ID: {order.id.slice(0, 8)}…</p>
          </div>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* Order info */}
        <div className="border border-border rounded-xl p-5 bg-card space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">ऑर्डर जानकारी</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <InfoRow label="पैकेज" value={(order.service_packages as { name_english?: string })?.name_english ?? order.package_id} />
            <InfoRow label="भुगतान स्थिति" value={order.payment_status} />
            <InfoRow label="डिलीवरी स्थान" value={order.delivery_location_text} />
            {order.preferred_date && <InfoRow label="पसंदीदा तारीख" value={order.preferred_date} />}
            <InfoRow label="ऑर्डर तारीख" value={new Date(order.created_at).toLocaleDateString("en-IN")} />
            {order.completed_at && (
              <InfoRow label="पूर्ण तारीख" value={new Date(order.completed_at).toLocaleDateString("en-IN")} />
            )}
          </div>
          {(order.delivery_lat && order.delivery_lon) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              <span>{order.delivery_lat.toFixed(4)}, {order.delivery_lon.toFixed(4)}</span>
            </div>
          )}
        </div>

        {/* Care schedule */}
        {order.care_schedule && order.care_schedule.length > 0 && (
          <div className="border border-border rounded-xl p-5 bg-card space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">देखभाल टाइमलाइन</h2>
            <div className="space-y-2">
              {order.care_schedule.map((m, i) => {
                const mUI = MILESTONE_STATUS_UI[m.status] ?? MILESTONE_STATUS_UI.pending;
                return (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className={`flex-shrink-0 ${mUI.color}`}>{mUI.icon}</span>
                    <div className="flex-1 flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-medium">माह {m.month} — देखभाल जाँच</span>
                      <span className="text-xs text-muted-foreground">{m.due_date}</span>
                    </div>
                    <span className={`text-xs font-medium capitalize ${mUI.color}`}>{m.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Proof submissions */}
        {proofs.length > 0 && (
          <div className="border border-border rounded-xl p-5 bg-card space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">प्रूफ सबमिशन</h2>
            <div className="space-y-3">
              {proofs.map((p, i) => {
                const proof = p as Record<string, unknown>;
                const photos = (proof.photo_urls as string[]) ?? [];
                return (
                  <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium capitalize">{String(proof.submission_type ?? "—").replace(/_/g, " ")}</span>
                      <span className={`px-2 py-0.5 rounded-full ${proof.status === "auto_approved" || proof.status === "approved" ? "bg-green-100 text-green-700" : proof.status === "rejected" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                        {String(proof.status ?? "—")}
                      </span>
                    </div>
                    {proof.geo_lat && proof.geo_lon && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {Number(proof.geo_lat).toFixed(4)}, {Number(proof.geo_lon).toFixed(4)}
                        {proof.auto_geo_ok === true && <span className="text-green-600 ml-1">✓ जियो OK</span>}
                        {proof.auto_geo_ok === false && <span className="text-red-500 ml-1">✗ जियो नहीं</span>}
                      </div>
                    )}
                    {photos.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {photos.map((url, j) => (
                          <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                             className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <FileImage className="w-3.5 h-3.5" /> फोटो {j + 1}
                          </a>
                        ))}
                      </div>
                    )}
                    {proof.vendor_notes && (
                      <p className="text-xs text-muted-foreground">{String(proof.vendor_notes)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Next step hints */}
        {order.status === "created" && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
            💳 भुगतान करने पर vendor assign होगा।
          </div>
        )}
        {order.status === "assigned" && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
            📋 Vendor को ऑर्डर accept करने की सूचना दी गई है।
          </div>
        )}
      </div>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="font-medium text-sm">{value}</div>
    </div>
  );
}
