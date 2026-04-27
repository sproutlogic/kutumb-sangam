/**
 * /vendor-portal — Vendor dashboard: assigned orders + proof upload.
 *
 * Requires approved vendor account.
 * Shows assigned orders, lets vendor accept and upload geo-tagged proof.
 */

import { useEffect, useState, useRef } from "react";
import { Loader2, TreePine, MapPin, CheckCircle2, Camera, Upload } from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import {
  fetchVendorDashboard,
  vendorAcceptOrder,
  uploadOrderProof,
  type ServiceOrder,
  type ProofUploadPayload,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const STATUS_UI: Record<string, { label: string; color: string }> = {
  assigned:        { label: "नया ऑर्डर", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  in_progress:     { label: "काम जारी", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  proof_submitted: { label: "प्रूफ अपलोड", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  completed:       { label: "पूर्ण ✅", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  cancelled:       { label: "रद्द", color: "bg-red-100 text-red-600" },
};

export default function VendorPortalPage() {
  const navigate = useNavigate();
  const [data, setData]         = useState<Awaited<ReturnType<typeof fetchVendorDashboard>>>(null);
  const [loading, setLoading]   = useState(true);
  const [proofOrderId, setProofOrderId] = useState<string | null>(null);

  // Proof form state
  const [photoUrls, setPhotoUrls]   = useState("");
  const [geoLat, setGeoLat]         = useState("");
  const [geoLon, setGeoLon]         = useState("");
  const [geoAcc, setGeoAcc]         = useState("");
  const [capturedAt, setCapturedAt] = useState(new Date().toISOString().slice(0, 16));
  const [vendorNotes, setVendorNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [geoLocating, setGeoLocating] = useState(false);

  async function load() {
    const d = await fetchVendorDashboard();
    setData(d);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function geoLocate() {
    if (!navigator.geolocation) {
      toast({ title: "जियो-लोकेशन उपलब्ध नहीं।", variant: "destructive" });
      return;
    }
    setGeoLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeoLat(pos.coords.latitude.toFixed(6));
        setGeoLon(pos.coords.longitude.toFixed(6));
        setGeoAcc(Math.round(pos.coords.accuracy).toString());
        setGeoLocating(false);
        toast({ title: "📍 लोकेशन मिली!" });
      },
      () => {
        setGeoLocating(false);
        toast({ title: "लोकेशन एक्सेस नहीं हुई।", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleProofSubmit() {
    if (!proofOrderId || !geoLat || !geoLon || !photoUrls.trim()) {
      toast({ title: "लोकेशन और फोटो URL ज़रूरी हैं।", variant: "destructive" });
      return;
    }
    const urls = photoUrls.split("\n").map(u => u.trim()).filter(Boolean);
    const payload: ProofUploadPayload = {
      photo_urls:    urls,
      geo_lat:       parseFloat(geoLat),
      geo_lon:       parseFloat(geoLon),
      geo_accuracy_m: geoAcc ? parseInt(geoAcc) : undefined,
      captured_at:   new Date(capturedAt).toISOString(),
      vendor_notes:  vendorNotes.trim() || undefined,
      submission_type: "initial",
    };
    setSubmitting(true);
    try {
      const res = await uploadOrderProof(proofOrderId, payload);
      toast({
        title: res.auto_approved ? "✅ Auto-approved! Prakriti Score अपडेट हुआ।" : "⚠️ Manual review में गया।",
        description: res.message,
      });
      setProofOrderId(null);
      await load();
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    } finally { setSubmitting(false); }
  }

  async function handleAccept(orderId: string) {
    try {
      await vendorAcceptOrder(orderId);
      toast({ title: "✅ ऑर्डर accept हो गया!" });
      await load();
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    }
  }

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="container">
          <div className="flex items-center gap-2 mb-1">
            <TreePine className="w-6 h-6" />
            <h1 className="font-heading text-2xl font-bold">Vendor Portal</h1>
          </div>
          <p className="text-sm opacity-70">आपके assigned ऑर्डर और proof upload</p>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> लोड हो रहा है…
          </div>
        ) : !data ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>Vendor account नहीं मिला। Admin से संपर्क करें।</p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(data.by_status).map(([status, count]) => (
                <div key={status} className="border border-border rounded-xl p-4 bg-card text-center">
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 capitalize">{(STATUS_UI[status]?.label ?? status)}</div>
                </div>
              ))}
            </div>

            {/* Orders */}
            {data.orders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                अभी कोई ऑर्डर assign नहीं है।
              </div>
            ) : (
              <div className="space-y-3">
                {data.orders.map((order: ServiceOrder) => {
                  const ui = STATUS_UI[order.status] ?? { label: order.status, color: "bg-slate-100 text-slate-700" };
                  return (
                    <div key={order.id} className="border border-border rounded-xl p-4 bg-card space-y-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">
                              {(order.service_packages as { name_english?: string })?.name_english ?? order.package_id}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ui.color}`}>{ui.label}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-xs">{order.delivery_location_text}</span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString("en-IN")}
                        </span>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => navigate(`/services/orders/${order.id}`)}
                          className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                          विवरण देखें
                        </button>
                        {order.status === "assigned" && (
                          <button
                            onClick={() => handleAccept(order.id)}
                            className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Accept करें
                          </button>
                        )}
                        {order.status === "in_progress" && (
                          <button
                            onClick={() => { setProofOrderId(order.id); setPhotoUrls(""); setGeoLat(""); setGeoLon(""); setGeoAcc(""); setVendorNotes(""); }}
                            className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Camera className="w-3.5 h-3.5" /> Proof Upload
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Proof upload modal */}
      {proofOrderId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-green-600" /> Proof Upload
            </h3>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">फोटो URLs (प्रत्येक लाइन पर एक) *</label>
              <textarea
                value={photoUrls}
                onChange={e => setPhotoUrls(e.target.value)}
                rows={3}
                placeholder="https://storage.supabase.co/..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">GPS लोकेशन *</label>
                <button
                  onClick={geoLocate}
                  disabled={geoLocating}
                  className="text-xs flex items-center gap-1 text-green-600 hover:text-green-800"
                >
                  {geoLocating && <Loader2 className="w-3 h-3 animate-spin" />}
                  <MapPin className="w-3 h-3" /> अभी मेरी लोकेशन
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={geoLat} onChange={e => setGeoLat(e.target.value)} placeholder="Latitude" type="number" step="any" className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                <input value={geoLon} onChange={e => setGeoLon(e.target.value)} placeholder="Longitude" type="number" step="any" className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              {geoAcc && <p className="text-[10px] text-muted-foreground mt-1">Accuracy: ±{geoAcc}m</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Capture Time *</label>
              <input
                type="datetime-local"
                value={capturedAt}
                onChange={e => setCapturedAt(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">नोट्स (वैकल्पिक)</label>
              <textarea
                value={vendorNotes}
                onChange={e => setVendorNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleProofSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Submit करें
              </button>
              <button
                onClick={() => setProofOrderId(null)}
                className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted"
              >
                रद्द करें
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              🌍 GPS coordinates delivery address के 500m के अंदर होने चाहिए — auto-approval के लिए।
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
