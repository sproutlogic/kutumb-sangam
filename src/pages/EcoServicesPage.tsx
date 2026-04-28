/**
 * /services — Eco Service Packages page.
 *
 * Shows 3 package cards (Taruvara, Dashavruksha, Jala Setu) with runtime prices.
 * Users browse without auth; order placement requires login.
 * Orders follow a managed plantation model (no delivery-address form).
 */

import { useEffect, useState } from "react";
import { TreePine, Droplets, Package, CheckCircle2, Loader2, ShoppingCart } from "lucide-react";
import AppShell from "@/components/shells/AppShell";
import {
  fetchServicePackages,
  createServiceOrder,
  type ServicePackage,
  type ServicePackageId,
  type CreateServiceOrderPayload,
} from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const PKG_ICONS: Record<string, React.ReactNode> = {
  taruvara:     <TreePine className="w-8 h-8 text-green-600" />,
  dashavruksha: <Package className="w-8 h-8 text-emerald-600" />,
  jala_setu:    <Droplets className="w-8 h-8 text-blue-500" />,
};

const PKG_COLOR: Record<string, string> = {
  taruvara:     "border-green-300 dark:border-green-700 bg-green-50/60 dark:bg-green-950/20",
  dashavruksha: "border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20",
  jala_setu:    "border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-950/20",
};

const PKG_BENEFITS: Record<string, string[]> = {
  taruvara:     ["1 पेड़ लगाया जाएगा", "12 महीने की देखभाल", "जियो-टैग्ड फोटो प्रूफ", "Prakriti Score +10"],
  dashavruksha: ["10 पेड़ लगाए जाएंगे", "12 महीने की देखभाल", "परिवार का हरित वाटिका", "Prakriti Score +100"],
  jala_setu:    ["जल-पात्र स्थापना", "12 महीने रख-रखाव", "वन्यजीव जल स्रोत", "Prakriti Score +5"],
};

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function EcoServicesPage() {
  const navigate = useNavigate();
  const [packages, setPackages]       = useState<ServicePackage[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<ServicePackageId | null>(null);
  const [ordering, setOrdering]       = useState(false);

  const MANAGED_LOCATION = "Prakriti managed plantation zone (Vrindavan/Ayodhya/Ashram/green-deficit communities)";

  useEffect(() => {
    fetchServicePackages()
      .then(setPackages)
      .finally(() => setLoading(false));
  }, []);

  async function handleOrder() {
    if (!selected) {
      toast({ title: "कृपया पहले पैकेज चुनें।", variant: "destructive" });
      return;
    }
    setOrdering(true);
    try {
      const payload: CreateServiceOrderPayload = {
        package_id: selected,
        delivery_location_text: MANAGED_LOCATION,
      };
      const res = await createServiceOrder(payload);
      toast({
        title: "✅ ऑर्डर बन गया!",
        description: `कुल: ${res.display_total}. Planting location, GPS, photos और ritual proof order timeline में साझा होंगे।`,
      });
      navigate(`/services/orders/${res.service_order_id}`);
    } catch (e) {
      toast({ title: String(e), variant: "destructive" });
    } finally { setOrdering(false); }
  }

  const selectedPkg = packages.find(p => p.id === selected);

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="container">
          <div className="flex items-center gap-2 mb-1">
            <TreePine className="w-6 h-6" />
            <h1 className="font-heading text-2xl font-bold">Eco Service Packages</h1>
          </div>
          <p className="text-sm opacity-70">
            सत्यापित eco-सेवाएं — vendor द्वारा जियो-टैग्ड प्रूफ के साथ
          </p>
        </div>
      </div>

      <div className="container py-8 space-y-8">
        {/* Package cards */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> पैकेज लोड हो रहे हैं…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {packages.map(pkg => (
              <div
                key={pkg.id}
                onClick={() => setSelected(pkg.id as ServicePackageId)}
                className={[
                  "border-2 rounded-2xl p-5 cursor-pointer transition-all hover:shadow-md space-y-3",
                  PKG_COLOR[pkg.id] ?? "border-border bg-card",
                  selected === pkg.id ? "ring-2 ring-green-500 shadow-lg" : "",
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  {PKG_ICONS[pkg.id] ?? <TreePine className="w-8 h-8" />}
                  <div>
                    <div className="font-bold text-lg leading-tight">{pkg.name_english}</div>
                    <div className="text-xs text-muted-foreground font-devanagari">{pkg.name_sanskrit}</div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">{pkg.description}</p>

                <ul className="space-y-1">
                  {(PKG_BENEFITS[pkg.id] ?? []).map(b => (
                    <li key={b} className="flex items-center gap-2 text-xs text-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>

                <div className="flex items-end justify-between pt-1">
                  <div>
                    <div className="text-2xl font-bold text-foreground">{formatInr(pkg.price_paise)}</div>
                    <div className="text-[10px] text-muted-foreground">+ GST 18%</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setSelected(pkg.id as ServicePackageId); document.getElementById("order-model")?.scrollIntoView({ behavior: "smooth" }); }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    चुनें
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* How it works */}
        <div className="border border-border rounded-xl p-5 bg-muted/30 space-y-3">
          <h2 className="font-semibold text-base">यह कैसे काम करता है?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            {[
              ["1️⃣", "पैकेज चुनें और भुगतान करें"],
              ["2️⃣", "नजदीकी verified vendor assign होगा"],
              ["3️⃣", "Vendor जियो-टैग्ड फोटो अपलोड करेगा"],
              ["4️⃣", "Auto-verify → Prakriti Score अपडेट"],
            ].map(([num, text]) => (
              <div key={num} className="flex items-start gap-2">
                <span className="text-xl flex-shrink-0">{num}</span>
                <span className="text-muted-foreground">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Managed order model (no address/date/billing form) */}
        {selected && selectedPkg && (
          <div id="order-model" className="border-2 border-green-400 dark:border-green-700 rounded-2xl p-6 space-y-4 bg-green-50/40 dark:bg-green-950/20">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-green-600" />
              <h2 className="font-semibold text-lg">
                {selectedPkg.name_english} — {formatInr(selectedPkg.price_paise)}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (+ {formatInr(Math.ceil(selectedPkg.price_paise * 18 / 100))} GST = {formatInr(selectedPkg.price_paise + Math.ceil(selectedPkg.price_paise * 18 / 100))} कुल)
                </span>
              </h2>
            </div>

            <div className="rounded-xl border border-border/60 bg-card/70 p-4 space-y-2">
              <p className="text-sm font-semibold">Plantation model</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                <li>स्थान हमारी टीम चुनती है — जैसे वृंदावन, अयोध्या, आश्रम, या हरित-विहीन विकसित होती बस्तियाँ।</li>
                <li>रोपण के बाद आपको GPS location, पौधे की फोटो और पंडित जी द्वारा किए गए plantation ritual का प्रमाण मिलेगा।</li>
                <li>हम पौधे की देखभाल 1 वर्ष तक (या renewal payment तक) करते हैं।</li>
              </ul>
            </div>

            <button
              onClick={handleOrder}
              disabled={ordering}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
            >
              {ordering && <Loader2 className="w-4 h-4 animate-spin" />}
              ऑर्डर प्लेस करें
            </button>
            <p className="text-xs text-muted-foreground">
              भुगतान/अगले चरण की जानकारी आपके order tracking में दिखाई जाएगी।
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
