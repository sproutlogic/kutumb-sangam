import { useEffect, useState } from 'react';
import { MapPin, Users, Plus, Leaf, Loader2, X } from 'lucide-react';
import AppShell from '@/components/shells/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchHaritCircles, createHaritCircle,
  type HaritCircle,
} from '@/services/api';
import { useToast } from '@/hooks/use-toast';

const CEREMONY_LABEL: Record<string, string> = {
  tree_planting:      'Tree Planting',
  waste_segregation:  'Waste Segregation',
  clean_up_drive:     'Clean-Up Drive',
  water_conservation: 'Water Conservation',
  eco_awareness:      'Eco Awareness',
  solar_adoption:     'Solar Adoption',
  composting:         'Composting',
};

export default function HaritCirclePage() {
  const { appUser } = useAuth();
  const { toast } = useToast();
  const isMitra = appUser?.role === 'pandit' || appUser?.role === 'admin' || appUser?.role === 'superadmin';

  const [circles, setCircles]     = useState<HaritCircle[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [creating, setCreating]   = useState(false);
  const [name, setName]           = useState('');
  const [location, setLocation]   = useState('');

  useEffect(() => {
    fetchHaritCircles().then(data => {
      setCircles(data);
      setLoading(false);
    });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createHaritCircle({ name: name.trim(), location_name: location.trim() || undefined });
      toast({ title: 'Harit Circle created!' });
      setName(''); setLocation(''); setShowForm(false);
      const updated = await fetchHaritCircles();
      setCircles(updated);
    } catch (err: unknown) {
      toast({ title: 'Could not create circle', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell>
      {/* Hero */}
      <div className="relative gradient-hero text-primary-foreground py-10 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.06) 0%, transparent 55%)' }} />
        <div className="container relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase opacity-60 font-body mb-1">Prakriti</p>
            <h1 className="font-heading text-3xl font-bold">Harit Circle</h1>
            <p className="text-sm opacity-75 font-body mt-1">SmartBin community groups anchored by Paryavaran Mitras</p>
          </div>
          {isMitra && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-foreground/15 border border-primary-foreground/30 text-primary-foreground font-semibold font-body text-sm hover:bg-primary-foreground/25 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Circle
            </button>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 gold-line opacity-60" />
      </div>

      <div className="container py-8">

        {/* Create form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-card rounded-2xl shadow-xl border border-border/50 w-full max-w-md p-6 animate-fade-in">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-heading text-xl font-bold">New Harit Circle</h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">Circle Name *</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Green Saket SmartBin Circle"
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-ring/30"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">Location (optional)</label>
                  <input
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. Saket, New Delhi"
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowForm(false)}
                    className="flex-1 py-2.5 rounded-lg border border-border font-body text-sm font-medium hover:bg-muted transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={creating}
                    className="flex-1 py-2.5 rounded-lg gradient-hero text-primary-foreground font-body text-sm font-semibold shadow-warm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : circles.length === 0 ? (
          <div className="text-center py-20">
            <Leaf className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <p className="font-heading text-xl font-semibold mb-2">No Harit Circles yet</p>
            <p className="text-muted-foreground font-body text-sm">
              {isMitra
                ? 'You can create the first Harit Circle in your community.'
                : 'A Paryavaran Mitra will create the first circle soon.'}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {circles.map(circle => (
              <div key={circle.id}
                className="bg-card rounded-2xl border border-border/50 shadow-card p-5 animate-fade-in hover:shadow-elevated transition-shadow">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                    <Leaf className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold text-base leading-tight truncate">{circle.name}</h3>
                    {circle.location_name && (
                      <p className="text-xs text-muted-foreground font-body flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {circle.location_name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground font-body pt-3 border-t border-border/40">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {circle.vansha_ids.length} {circle.vansha_ids.length === 1 ? 'vansha' : 'vanshas'}
                  </span>
                  <span className="ml-auto text-xs">
                    {new Date(circle.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
