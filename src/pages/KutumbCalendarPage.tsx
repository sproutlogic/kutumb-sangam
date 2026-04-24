import { useState, useEffect } from 'react';
import { CalendarDays, Plus, Megaphone, Trash2, Bell, X } from 'lucide-react';
import AppShell from '@/components/shells/AppShell';
import { useLang } from '@/i18n/LanguageContext';
import { getApiBaseUrl, resolveVanshaIdForApi } from '@/services/api';
import { toast } from '@/hooks/use-toast';

interface CalendarEvent {
  id: string;
  title: string;
  event_date: string;
  event_type: 'birthday' | 'anniversary' | 'event' | 'announcement';
  description?: string;
  recurs_yearly: boolean;
  is_announcement: boolean;
  created_at: string;
}

const TYPE_EMOJI: Record<string, string> = {
  birthday: '🎂', anniversary: '💍', event: '📅', announcement: '📢',
};
const TYPE_COLOR: Record<string, string> = {
  birthday: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  anniversary: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  event: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  announcement: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

function getAuthToken(): string {
  try {
    for (const k of Object.keys(localStorage).filter(k => k.endsWith('-auth-token'))) {
      const p = JSON.parse(localStorage.getItem(k) || '{}');
      if (p?.access_token) return p.access_token;
    }
  } catch { /* ignore */ }
  return '';
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export default function KutumbCalendarPage() {
  const { tr } = useLang();
  const vanshaId = resolveVanshaIdForApi(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [isAnnouncement, setIsAnnouncement] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState('event');
  const [desc, setDesc] = useState('');
  const [recurs, setRecurs] = useState(false);
  const [saving, setSaving] = useState(false);

  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  useEffect(() => {
    if (!vanshaId) { setLoading(false); return; }
    fetch(`${getApiBaseUrl()}/api/calendar/events?vansha_id=${vanshaId}`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [vanshaId]);

  async function save() {
    if (!title.trim() || !date) { toast({ title: tr('fillRequired'), variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/calendar/events`, {
        method: 'POST', headers,
        body: JSON.stringify({
          vansha_id: vanshaId,
          title: title.trim(), event_date: date,
          event_type: isAnnouncement ? 'announcement' : type,
          description: desc || null,
          recurs_yearly: recurs,
          is_announcement: isAnnouncement,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || tr('errorGeneric'));
      setEvents(prev => [...prev, data].sort((a, b) => a.event_date.localeCompare(b.event_date)));
      toast({ title: isAnnouncement ? tr('announcementSent') : tr('eventAdded') });
      setShowAdd(false); setTitle(''); setDate(''); setDesc(''); setType('event'); setRecurs(false);
    } catch (e) {
      toast({ title: String(e), variant: 'destructive' });
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    await fetch(`${getApiBaseUrl()}/api/calendar/events/${id}`, { method: 'DELETE', headers });
    setEvents(prev => prev.filter(e => e.id !== id));
    toast({ title: tr('eventDeleted') });
  }

  const upcoming = events.filter(e => daysUntil(e.event_date) >= 0).slice(0, 30);
  const announcements = events.filter(e => e.is_announcement);

  return (
    <AppShell>
      <div className="relative gradient-hero text-primary-foreground py-8 overflow-hidden">
        <div className="container flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="w-6 h-6" />
              <h1 className="font-heading text-2xl font-bold">{tr('calendarTitle')}</h1>
            </div>
            <p className="text-sm opacity-70 font-body">{tr('calendarSubtitle')}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setIsAnnouncement(true); setShowAdd(true); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-foreground/15 text-primary-foreground text-sm font-semibold hover:bg-primary-foreground/25 transition-colors">
              <Megaphone className="w-4 h-4" /> {tr('announce')}
            </button>
            <button onClick={() => { setIsAnnouncement(false); setShowAdd(true); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-foreground/15 text-primary-foreground text-sm font-semibold hover:bg-primary-foreground/25 transition-colors">
              <Plus className="w-4 h-4" /> {tr('addEvent')}
            </button>
          </div>
        </div>
      </div>

      <div className="container py-8 space-y-6">
        {!vanshaId && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-xl p-4 text-sm font-body text-amber-800 dark:text-amber-300">
            {tr('noVanshaId')}
          </div>
        )}

        {/* Announcements */}
        {announcements.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-heading font-bold flex items-center gap-2"><Megaphone className="w-4 h-4 text-amber-500" /> {tr('announcements')}</h2>
            {announcements.map(e => (
              <div key={e.id} className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold font-body text-sm">{e.title}</p>
                  {e.description && <p className="text-xs text-muted-foreground font-body mt-1">{e.description}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDate(e.event_date)}</p>
                </div>
                <button onClick={() => remove(e.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming Events */}
        <div>
          <h2 className="font-heading font-bold mb-4 flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> {tr('upcomingEvents')}
          </h2>
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-card rounded-xl animate-pulse border border-border/40" />)}</div>
          ) : upcoming.filter(e => !e.is_announcement).length === 0 ? (
            <div className="bg-card rounded-xl p-8 text-center border border-border/50">
              <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-body">{tr('noEventsYet')}</p>
              <button onClick={() => setShowAdd(true)} className="mt-3 text-primary text-sm font-medium font-body hover:underline">{tr('addFirst')}</button>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.filter(e => !e.is_announcement).map(e => {
                const days = daysUntil(e.event_date);
                return (
                  <div key={e.id} className="bg-card rounded-xl p-4 border border-border/50 flex items-center gap-4 shadow-card">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 bg-secondary/50">
                      {TYPE_EMOJI[e.event_type] || '📅'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold font-body text-sm">{e.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[e.event_type]}`}>
                          {e.event_type}
                        </span>
                        <span className="text-xs text-muted-foreground font-body">{formatDate(e.event_date)}</span>
                        {e.recurs_yearly && <span className="text-[10px] text-muted-foreground">↻ yearly</span>}
                      </div>
                      {e.description && <p className="text-xs text-muted-foreground font-body mt-1 line-clamp-1">{e.description}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {days === 0 ? (
                        <span className="text-xs font-bold text-primary font-body">Today!</span>
                      ) : days === 1 ? (
                        <span className="text-xs font-semibold text-accent font-body">Tomorrow</span>
                      ) : (
                        <span className="text-xs text-muted-foreground font-body">in {days}d</span>
                      )}
                    </div>
                    <button onClick={() => remove(e.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Event / Announce Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border/50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h3 className="font-heading font-bold">{isAnnouncement ? tr('announceToKutumb') : tr('addEvent')}</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('title')}</label>
                <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              {!isAnnouncement && (
                <div>
                  <label className="block text-xs font-medium mb-1.5">{tr('eventType')}</label>
                  <select value={type} onChange={e => setType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40">
                    {['birthday','anniversary','event'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('eventDate')}</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{tr('description')} <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} maxLength={1000}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              {!isAnnouncement && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={recurs} onChange={e => setRecurs(e.target.checked)} className="accent-primary" />
                  <span className="text-sm font-body">{tr('recurYearly')}</span>
                </label>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border/50 flex gap-3">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-body">{tr('cancel')}</button>
              <button onClick={save} disabled={saving}
                className="flex-1 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold text-sm shadow-warm hover:opacity-90 disabled:opacity-50">
                {saving ? tr('saving') : isAnnouncement ? tr('sendAnnouncement') : tr('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
