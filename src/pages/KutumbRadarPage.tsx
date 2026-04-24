import { useState, useCallback } from 'react';
import { Radar, MapPin, RefreshCw, Users, AlertTriangle, ToggleLeft, ToggleRight } from 'lucide-react';
import AppShell from '@/components/shells/AppShell';
import { useLang } from '@/i18n/LanguageContext';
import { getApiBaseUrl, resolveVanshaIdForApi } from '@/services/api';
import { toast } from '@/hooks/use-toast';

interface NearbyMember {
  user_id: string;
  name: string;
  distance_km: number;
  relation: 'kutumb' | 'in-law';
  updated_at: string;
}

const RADIUS_OPTIONS = [1, 5, 10, 25, 50];

function getAuthToken(): string {
  try {
    for (const k of Object.keys(localStorage).filter(k => k.endsWith('-auth-token'))) {
      const p = JSON.parse(localStorage.getItem(k) || '{}');
      if (p?.access_token) return p.access_token;
    }
  } catch { /* ignore */ }
  return '';
}

function timeSince(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function KutumbRadarPage() {
  const { tr } = useLang();
  const vanshaId = resolveVanshaIdForApi(null);
  const [consent, setConsent] = useState(false);
  const [radius, setRadius] = useState(10);
  const [members, setMembers] = useState<NearbyMember[]>([]);
  const [myLocation, setMyLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const updateLocation = useCallback(async (shareConsent: boolean) => {
    if (!vanshaId) { toast({ title: tr('noVanshaId'), variant: 'destructive' }); return; }
    setLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 })
      );
      const { latitude, longitude, accuracy } = pos.coords;
      setMyLocation({ lat: latitude, lon: longitude });

      // Push location to backend
      await fetch(`${getApiBaseUrl()}/api/radar/location`, {
        method: 'PUT', headers,
        body: JSON.stringify({
          vansha_id: vanshaId,
          latitude, longitude,
          accuracy_m: Math.round(accuracy),
          sharing_consent: shareConsent,
        }),
      });

      if (!shareConsent) { setConsent(false); setMembers([]); setLoading(false); return; }
      setConsent(true);

      // Fetch nearby
      const res = await fetch(
        `${getApiBaseUrl()}/api/radar/nearby?vansha_id=${vanshaId}&radius_km=${radius}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
      setLastUpdated(new Date());
      toast({ title: tr('locationUpdated') });
    } catch (e: unknown) {
      if (e instanceof GeolocationPositionError) {
        toast({ title: tr('gpsPermissionDenied'), variant: 'destructive' });
      } else {
        toast({ title: tr('errorGeneric'), variant: 'destructive' });
      }
    } finally { setLoading(false); }
  }, [vanshaId, radius]);

  async function toggleConsent() {
    if (consent) {
      await updateLocation(false);
    } else {
      await updateLocation(true);
    }
  }

  return (
    <AppShell>
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="container">
          <div className="flex items-center gap-2 mb-1">
            <Radar className="w-6 h-6" />
            <h1 className="font-heading text-2xl font-bold">{tr('radarTitle')}</h1>
          </div>
          <p className="text-sm opacity-70 font-body">{tr('radarSubtitle')}</p>
        </div>
      </div>

      <div className="container py-8 space-y-6">
        {/* Privacy consent card */}
        <div className="bg-card rounded-xl p-5 shadow-card border border-border/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold font-body text-sm mb-1">{tr('radarSharingTitle')}</p>
              <p className="text-xs text-muted-foreground font-body">{tr('radarSharingDesc')}</p>
            </div>
            <button onClick={toggleConsent} disabled={loading} className="flex-shrink-0">
              {consent
                ? <ToggleRight className="w-8 h-8 text-primary" />
                : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
            </button>
          </div>
          {!consent && (
            <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground font-body">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              {tr('radarPrivacyNote')}
            </div>
          )}
        </div>

        {/* Radius selector */}
        <div className="bg-card rounded-xl p-5 shadow-card border border-border/50">
          <p className="text-sm font-semibold font-body mb-3">{tr('selectRadius')}</p>
          <div className="flex gap-2 flex-wrap">
            {RADIUS_OPTIONS.map(r => (
              <button key={r} onClick={() => setRadius(r)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold font-body transition-all ${
                  radius === r ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary text-foreground hover:bg-secondary/80'
                }`}>
                {r} km
              </button>
            ))}
          </div>
        </div>

        {/* Update location button */}
        <button
          onClick={() => updateLocation(consent)}
          disabled={loading || !vanshaId}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl gradient-hero text-primary-foreground font-semibold shadow-warm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? tr('locating') : tr('updateLocation')}
        </button>

        {/* My location */}
        {myLocation && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-body">
            <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            {tr('myLocation')}: {myLocation.lat.toFixed(5)}, {myLocation.lon.toFixed(5)}
            {lastUpdated && <span className="ml-1">· {tr('updated')} {timeSince(lastUpdated.toISOString())}</span>}
          </div>
        )}

        {/* Nearby members */}
        {consent && (
          <div>
            <h2 className="font-heading font-bold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {tr('nearbyMembers')} ({members.length})
            </h2>
            {members.length === 0 ? (
              <div className="bg-card rounded-xl p-8 text-center border border-border/50">
                <Radar className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-body">{tr('noNearbyMembers', { radius: String(radius) })}</p>
                <p className="text-xs text-muted-foreground font-body mt-1">{tr('radarHint')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map(m => (
                  <div key={m.user_id} className="bg-card rounded-xl p-4 border border-border/50 flex items-center gap-4 shadow-card">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      m.relation === 'kutumb' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'
                    }`}>
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold font-body text-sm">{m.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          m.relation === 'kutumb'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-accent/10 text-accent'
                        }`}>{m.relation}</span>
                        <span className="text-xs text-muted-foreground font-body">
                          {tr('lastSeen')} {timeSince(m.updated_at)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold font-heading text-primary">{m.distance_km < 1 ? `${Math.round(m.distance_km * 1000)}m` : `${m.distance_km}km`}</p>
                      <p className="text-[10px] text-muted-foreground font-body">{tr('away')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
