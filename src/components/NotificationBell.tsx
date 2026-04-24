import { useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getApiBaseUrl } from '@/services/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const base = getApiBaseUrl();
  const [open, setOpen] = useState(false);

  const authHeaders = {
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  };

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch(`${base}/api/notifications`, { headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session,
    refetchInterval: 60_000,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch(`${base}/api/notifications/read-all`, { method: 'POST', headers: authHeaders });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${base}/api/notifications/${id}/read`, { method: 'PATCH', headers: authHeaders });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = notifications.filter((n) => !n.read).length;

  if (!session) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-secondary/50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 w-80 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-heading font-semibold text-sm">Notifications</span>
              {unread > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60"
                >
                  {markAllRead.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
              {notifications.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground font-body py-8">No notifications yet</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { if (!n.read) markOne.mutate(n.id); }}
                    className={`w-full text-left px-4 py-3 hover:bg-secondary/30 transition-colors ${n.read ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                      <div className={!n.read ? '' : 'ml-4'}>
                        <p className="text-sm font-medium font-body leading-snug">{n.title}</p>
                        <p className="text-xs text-muted-foreground font-body mt-0.5 leading-relaxed">{n.body}</p>
                        <p className="text-[10px] text-muted-foreground/60 font-body mt-1">
                          {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
