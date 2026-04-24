import { useState, useEffect, useRef } from 'react';
import { Archive, Plus, Mic, Type, Clock, MapPin, Trash2, X, StopCircle, Play, Square } from 'lucide-react';
import AppShell from '@/components/shells/AppShell';
import { useLang } from '@/i18n/LanguageContext';
import { getApiBaseUrl, resolveVanshaIdForApi } from '@/services/api';
import { useTree } from '@/contexts/TreeContext';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

const TEXT_MAX = 500;
const VOICE_MAX_SECS = 60;

interface LegacyMessage {
  id: string;
  recipient_name: string;
  message_type: 'text' | 'voice';
  trigger_type: 'time' | 'location';
  trigger_time?: string;
  trigger_place_name?: string;
  voice_duration_sec?: number;
  status: 'pending' | 'delivered' | 'expired';
  created_at: string;
}

function getAuthToken(): string {
  try {
    for (const k of Object.keys(localStorage).filter(k => k.endsWith('-auth-token'))) {
      const p = JSON.parse(localStorage.getItem(k) || '{}');
      if (p?.access_token) return p.access_token;
    }
  } catch { /* ignore */ }
  return '';
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  expired: 'bg-secondary text-muted-foreground',
};

export default function LegacyBoxPage() {
  const { tr } = useLang();
  const vanshaId = resolveVanshaIdForApi(null);
  const { state } = useTree();
  const [messages, setMessages] = useState<LegacyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);

  // Compose state
  const [msgType, setMsgType] = useState<'text' | 'voice'>('text');
  const [text, setText] = useState('');
  const [triggerType, setTriggerType] = useState<'time' | 'location'>('time');
  const [triggerTime, setTriggerTime] = useState('');
  const [triggerLat, setTriggerLat] = useState<number | null>(null);
  const [triggerLon, setTriggerLon] = useState<number | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [radiusM, setRadiusM] = useState(100);
  const [recipientId, setRecipientId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [saving, setSaving] = useState(false);

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  useEffect(() => {
    if (!vanshaId) { setLoading(false); return; }
    fetch(`${getApiBaseUrl()}/api/legacy/messages?vansha_id=${vanshaId}`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [vanshaId]);

  // Voice recording helpers
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = e => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
      setRecordSecs(0);
      timerRef.current = setInterval(() => {
        setRecordSecs(s => {
          if (s + 1 >= VOICE_MAX_SECS) { stopRecording(); return s + 1; }
          return s + 1;
        });
      }, 1000);
    } catch {
      toast({ title: tr('micPermissionDenied'), variant: 'destructive' });
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function captureLocation() {
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      );
      setTriggerLat(pos.coords.latitude);
      setTriggerLon(pos.coords.longitude);
      toast({ title: tr('locationCaptured') });
    } catch {
      toast({ title: tr('gpsPermissionDenied'), variant: 'destructive' });
    }
  }

  async function handleSave() {
    if (!recipientId) { toast({ title: tr('selectRecipient'), variant: 'destructive' }); return; }
    if (msgType === 'text' && !text.trim()) { toast({ title: tr('enterMessage'), variant: 'destructive' }); return; }
    if (msgType === 'voice' && !audioBlob) { toast({ title: tr('recordFirst'), variant: 'destructive' }); return; }
    if (triggerType === 'time' && !triggerTime) { toast({ title: tr('setTriggerTime'), variant: 'destructive' }); return; }
    if (triggerType === 'location' && (triggerLat === null || triggerLon === null)) {
      toast({ title: tr('setTriggerLocation'), variant: 'destructive' }); return;
    }

    setSaving(true);
    try {
      let voiceUrl: string | null = null;

      if (msgType === 'voice' && audioBlob) {
        if (!supabase) throw new Error('Supabase not configured — voice messages require Supabase Storage.');
        const path = `voices/${Date.now()}-${Math.random().toString(36).slice(2)}.webm`;
        const { error } = await supabase.storage.from('legacy-voices').upload(path, audioBlob);
        if (error) throw new Error(error.message);
        const { data } = supabase.storage.from('legacy-voices').getPublicUrl(path);
        voiceUrl = data.publicUrl;
      }

      const res = await fetch(`${getApiBaseUrl()}/api/legacy/messages`, {
        method: 'POST', headers,
        body: JSON.stringify({
          vansha_id: vanshaId,
          recipient_node_id: recipientId,
          recipient_name: recipientName,
          message_type: msgType,
          text_content: msgType === 'text' ? text.trim() : null,
          voice_url: voiceUrl,
          voice_duration_sec: msgType === 'voice' ? recordSecs : null,
          trigger_type: triggerType,
          trigger_time: triggerType === 'time' ? new Date(triggerTime).toISOString() : null,
          trigger_lat: triggerType === 'location' ? triggerLat : null,
          trigger_lon: triggerType === 'location' ? triggerLon : null,
          trigger_radius_m: radiusM,
          trigger_place_name: placeName || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || tr('errorGeneric'));
      setMessages(prev => [{ ...data, recipient_name: recipientName }, ...prev]);
      toast({ title: tr('messageSaved') });
      setShowCompose(false);
      resetCompose();
    } catch (e) {
      toast({ title: String(e), variant: 'destructive' });
    } finally { setSaving(false); }
  }

  function resetCompose() {
    setText(''); setTriggerTime(''); setTriggerLat(null); setTriggerLon(null);
    setPlaceName(''); setRadiusM(100); setRecipientId(''); setRecipientName('');
    setAudioBlob(null); setRecordSecs(0); setMsgType('text'); setTriggerType('time');
  }

  async function removeMsg(id: string) {
    await fetch(`${getApiBaseUrl()}/api/legacy/messages/${id}`, { method: 'DELETE', headers });
    setMessages(prev => prev.filter(m => m.id !== id));
    toast({ title: tr('messageDeleted') });
  }

  const nodes = state.nodes;

  return (
    <AppShell>
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="container flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Archive className="w-6 h-6" />
              <h1 className="font-heading text-2xl font-bold">{tr('legacyBoxTitle')}</h1>
            </div>
            <p className="text-sm opacity-70 font-body">{tr('legacyBoxSubtitle')}</p>
          </div>
          <button onClick={() => setShowCompose(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-foreground/15 text-primary-foreground text-sm font-semibold hover:bg-primary-foreground/25 transition-colors">
            <Plus className="w-4 h-4" /> {tr('composeMessage')}
          </button>
        </div>
      </div>

      <div className="container py-8 space-y-4">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-card rounded-xl animate-pulse border border-border/40" />)}</div>
        ) : messages.length === 0 ? (
          <div className="bg-card rounded-xl p-10 text-center border border-border/50">
            <Archive className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-heading font-bold mb-1">{tr('noMessagesYet')}</p>
            <p className="text-sm text-muted-foreground font-body mb-4">{tr('legacyBoxEmptyDesc')}</p>
            <button onClick={() => setShowCompose(true)}
              className="px-6 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90">
              {tr('composeMessage')}
            </button>
          </div>
        ) : messages.map(m => (
          <div key={m.id} className="bg-card rounded-xl p-4 border border-border/50 shadow-card flex items-start gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              m.message_type === 'voice' ? 'bg-pink-100 dark:bg-pink-950/40' : 'bg-blue-100 dark:bg-blue-950/40'
            }`}>
              {m.message_type === 'voice' ? <Mic className="w-5 h-5 text-pink-600" /> : <Type className="w-5 h-5 text-blue-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold font-body text-sm">To: {m.recipient_name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[m.status]}`}>{m.status}</span>
                {m.trigger_type === 'time'
                  ? <span className="text-xs text-muted-foreground font-body flex items-center gap-1"><Clock className="w-3 h-3" />{m.trigger_time ? new Date(m.trigger_time).toLocaleString('en-IN') : '—'}</span>
                  : <span className="text-xs text-muted-foreground font-body flex items-center gap-1"><MapPin className="w-3 h-3" />{m.trigger_place_name || tr('locationTrigger')}</span>
                }
                {m.voice_duration_sec && <span className="text-xs text-muted-foreground font-body">{m.voice_duration_sec}s voice</span>}
              </div>
            </div>
            {m.status === 'pending' && (
              <button onClick={() => removeMsg(m.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 sticky top-0 bg-card">
              <h3 className="font-heading font-bold">{tr('composeMessage')}</h3>
              <button onClick={() => { setShowCompose(false); resetCompose(); }}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Message type */}
              <div>
                <label className="block text-xs font-medium mb-2">{tr('messageType')}</label>
                <div className="flex gap-2">
                  {(['text','voice'] as const).map(t => (
                    <button key={t} onClick={() => setMsgType(t)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        msgType === t ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary'
                      }`}>
                      {t === 'text' ? <Type className="w-4 h-4" /> : <Mic className="w-4 h-4" />} {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient */}
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('recipient')}</label>
                <select value={recipientId} onChange={e => {
                  setRecipientId(e.target.value);
                  setRecipientName(nodes.find(n => n.id === e.target.value)?.name || '');
                }} className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <option value="">{tr('selectMember')}</option>
                  {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>

              {/* Text content */}
              {msgType === 'text' && (
                <div>
                  <label className="block text-xs font-medium mb-1.5">{tr('message')} ({text.length}/{TEXT_MAX})</label>
                  <textarea value={text} onChange={e => setText(e.target.value.slice(0, TEXT_MAX))}
                    rows={4} maxLength={TEXT_MAX} placeholder={tr('writeYourMessage')}
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              )}

              {/* Voice recording */}
              {msgType === 'voice' && (
                <div className="bg-secondary/30 rounded-xl p-4 text-center">
                  {!audioBlob ? (
                    <>
                      {recording ? (
                        <div>
                          <div className="text-2xl font-bold font-heading text-destructive mb-2 animate-pulse">
                            {recordSecs}s / {VOICE_MAX_SECS}s
                          </div>
                          <button onClick={stopRecording}
                            className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg bg-destructive text-white font-semibold text-sm">
                            <StopCircle className="w-4 h-4" /> {tr('stopRecording')}
                          </button>
                        </div>
                      ) : (
                        <button onClick={startRecording}
                          className="flex items-center gap-2 mx-auto px-4 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold text-sm shadow-warm">
                          <Mic className="w-4 h-4" /> {tr('startRecording')}
                        </button>
                      )}
                      <p className="text-xs text-muted-foreground font-body mt-2">{tr('voiceMaxHint', { max: String(VOICE_MAX_SECS) })}</p>
                    </>
                  ) : (
                    <div>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <Play className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold font-body">{recordSecs}s {tr('recorded')}</span>
                      </div>
                      <button onClick={() => { setAudioBlob(null); setRecordSecs(0); }}
                        className="flex items-center gap-1.5 mx-auto text-xs text-destructive font-body hover:underline">
                        <Square className="w-3 h-3" /> {tr('reRecord')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Trigger type */}
              <div>
                <label className="block text-xs font-medium mb-2">{tr('triggerType')}</label>
                <div className="flex gap-2">
                  {(['time','location'] as const).map(t => (
                    <button key={t} onClick={() => setTriggerType(t)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        triggerType === t ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary'
                      }`}>
                      {t === 'time' ? <Clock className="w-4 h-4" /> : <MapPin className="w-4 h-4" />} {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time trigger */}
              {triggerType === 'time' && (
                <div>
                  <label className="block text-xs font-medium mb-1.5">{tr('deliverAt')}</label>
                  <input type="datetime-local" value={triggerTime} onChange={e => setTriggerTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              )}

              {/* Location trigger */}
              {triggerType === 'location' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5">{tr('placeName')}</label>
                    <input value={placeName} onChange={e => setPlaceName(e.target.value)} placeholder={tr('placeNamePlaceholder')} maxLength={200}
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <button onClick={captureLocation}
                    className="flex items-center gap-1.5 text-sm font-semibold text-primary font-body hover:underline">
                    <MapPin className="w-4 h-4" />
                    {triggerLat ? `${tr('captured')}: ${triggerLat.toFixed(4)}, ${triggerLon?.toFixed(4)}` : tr('useMyCurrentLocation')}
                  </button>
                  <div>
                    <label className="block text-xs font-medium mb-1.5">{tr('triggerRadius')}: {radiusM}m</label>
                    <input type="range" min={50} max={1000} step={50} value={radiusM} onChange={e => setRadiusM(Number(e.target.value))}
                      className="w-full accent-primary" />
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border/50 flex gap-3 sticky bottom-0 bg-card">
              <button onClick={() => { setShowCompose(false); resetCompose(); }} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-body">{tr('cancel')}</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50">
                {saving ? tr('saving') : tr('saveLegacyMessage')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
