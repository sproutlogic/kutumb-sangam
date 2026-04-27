import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, User, Calendar, MapPin, Loader2, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiBaseUrl } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface Person {
  node_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  gotra: string;
  date_of_birth: string;
  verification_tier: string;
  vansha_id: string;
}

interface QueueItem {
  id: string;
  vansha_id: string;
  node_id: string;
  requested_by: string;
  status: string;
  created_at: string;
  person: Person | null;
}

function useAuthFetch() {
  const { session } = useAuth();
  return (url: string, init?: RequestInit) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
    });
}

export default function PanditDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const authFetch = useAuthFetch();
  const base = getApiBaseUrl();

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const { data: queue = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ['margdarshak-queue'],
    queryFn: async () => {
      const res = await authFetch(`${base}/api/margdarshak/queue`);
      if (!res.ok) throw new Error('Failed to load queue');
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ request_id, action }: { request_id: string; action: string }) => {
      const res = await authFetch(`${base}/api/margdarshak/review`, {
        method: 'POST',
        body: JSON.stringify({ request_id, action, notes: notes.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? 'Review failed');
      }
      return res.json();
    },
    onSuccess: (_data, { action }) => {
      toast({ title: action === 'approved' ? 'Approved' : 'Rejected', description: 'Decision saved and family notified.' });
      setReviewingId(null);
      setNotes('');
      qc.invalidateQueries({ queryKey: ['margdarshak-queue'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleAction = (item: QueueItem, action: 'approved' | 'rejected') => {
    reviewMutation.mutate({ request_id: item.id, action });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <ClipboardList className="w-7 h-7 text-primary" />
          <div>
            <p className="text-[10px] tracking-[0.15em] uppercase text-emerald-600 font-body mb-0.5">Paryavaran Mitra</p>
            <h1 className="font-heading text-2xl font-bold">Harit Vanshavali Verification Queue</h1>
            <p className="text-sm text-muted-foreground font-body">{queue.length} pending verification{queue.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground font-body">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">All clear — no pending verifications.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {queue.map((item) => (
              <div key={item.id} className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-heading font-semibold text-base">
                          {item.person
                            ? `${item.person.first_name} ${item.person.last_name}`
                            : 'Unknown Member'}
                        </p>
                        {item.person?.gotra && (
                          <p className="text-xs text-muted-foreground font-body">Gotra: {item.person.gotra}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-body whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>

                  {item.person && (
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-body text-muted-foreground">
                      {item.person.date_of_birth && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {item.person.date_of_birth}
                        </span>
                      )}
                      {item.person.gender && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {item.person.gender}
                        </span>
                      )}
                      <span className="flex items-center gap-1 col-span-2">
                        <MapPin className="w-3 h-3" />
                        Tier: <strong>{item.person.verification_tier ?? 'none'}</strong>
                      </span>
                    </div>
                  )}

                  {reviewingId === item.id && (
                    <div className="mt-4">
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional notes for the family (reason for rejection, etc.)"
                        rows={2}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background font-body focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
                      />
                    </div>
                  )}
                </div>

                <div className="px-5 pb-4 flex gap-2">
                  {reviewingId !== item.id ? (
                    <button
                      onClick={() => { setReviewingId(item.id); setNotes(''); }}
                      className="text-sm font-body text-primary hover:underline"
                    >
                      Review
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleAction(item, 'approved')}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold font-body hover:bg-green-700 transition-colors disabled:opacity-60"
                      >
                        {reviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(item, 'rejected')}
                        disabled={reviewMutation.isPending}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold font-body hover:opacity-90 transition-opacity disabled:opacity-60"
                      >
                        {reviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Reject
                      </button>
                      <button
                        onClick={() => { setReviewingId(null); setNotes(''); }}
                        className="px-3 py-2 text-sm text-muted-foreground font-body hover:underline"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
