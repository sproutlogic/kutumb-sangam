import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, Leaf, Users, MapPin, Search, ArrowLeft } from "lucide-react";
import { fetchLeaderboard, type LeaderboardEntry } from "@/services/api";

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.round(score));
  return (
    <div className="w-full bg-emerald-100 dark:bg-emerald-900/30 rounded-full h-1.5 mt-1">
      <div
        className="bg-emerald-500 h-1.5 rounded-full transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState("");
  const [debouncedLocation, setDebouncedLocation] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (loc: string) => {
    setLoading(true);
    const data = await fetchLeaderboard(loc || undefined, 50, 0);
    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(debouncedLocation);
  }, [debouncedLocation, load]);

  const handleLocationChange = (val: string) => {
    setLocationFilter(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedLocation(val), 400);
  };

  // Derive unique locations for quick-select chips
  const uniqueLocations = Array.from(new Set(entries.map((e) => e.location))).slice(0, 8);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950 dark:to-gray-950">
      {/* Header */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-emerald-100 dark:border-emerald-900 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/40 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
          </button>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-emerald-600" />
            <span className="font-heading font-bold text-emerald-900 dark:text-white">Prakriti Leaderboard</span>
          </div>
          <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400">India's Greenest Families</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <div className="text-center space-y-2">
          <div className="text-5xl">🌳</div>
          <h1 className="font-heading text-2xl font-bold text-emerald-900 dark:text-white">
            India's Greenest Families
          </h1>
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Ranked by Prakriti Score — trees planted, eco-pledges kept, green hours logged.
          </p>
        </div>

        {/* Location filter */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
            <input
              type="text"
              value={locationFilter}
              onChange={(e) => handleLocationChange(e.target.value)}
              placeholder="Filter by city or state… (e.g. Kanpur, UP)"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-emerald-300"
            />
          </div>

          {/* Quick-select chips — only shown while unfiltered and data loaded */}
          {!locationFilter && uniqueLocations.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {uniqueLocations.map((loc) => (
                <button
                  key={loc}
                  onClick={() => handleLocationChange(loc)}
                  className="text-xs px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
                >
                  📍 {loc}
                </button>
              ))}
            </div>
          )}
          {locationFilter && (
            <button
              onClick={() => handleLocationChange("")}
              className="text-xs text-emerald-600 underline"
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Leaderboard list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Leaf className="w-12 h-12 text-emerald-200 mx-auto" />
            <p className="text-emerald-600 dark:text-emerald-400 font-medium">
              {locationFilter ? `No families found in "${locationFilter}"` : "No families on the leaderboard yet."}
            </p>
            <p className="text-sm text-muted-foreground">Be the first — plant your family's first root.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Top-3 podium */}
            {!locationFilter && entries.length >= 3 && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[entries[1], entries[0], entries[2]].map((e, idx) => {
                  const podiumOrder = [2, 1, 3][idx];
                  const heights = ["h-20", "h-28", "h-16"];
                  return (
                    <div
                      key={e.vansha_id}
                      className={`flex flex-col items-center justify-end ${heights[idx]} bg-white dark:bg-gray-900 rounded-xl border-2 ${podiumOrder === 1 ? "border-yellow-400" : podiumOrder === 2 ? "border-gray-300" : "border-amber-600"} p-3 shadow-sm`}
                    >
                      <div className="text-2xl">{MEDAL[podiumOrder]}</div>
                      <p className="text-xs font-bold text-center truncate w-full text-center">{e.family_name}</p>
                      <p className="text-xs text-emerald-600 font-semibold">{e.score}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full ranked list */}
            {entries.map((entry) => (
              <div
                key={entry.vansha_id}
                className={`flex items-center gap-4 bg-white dark:bg-gray-900 rounded-xl p-4 border shadow-sm transition-shadow hover:shadow-md ${entry.rank <= 3 ? "border-emerald-200 dark:border-emerald-800" : "border-border/50"}`}
              >
                {/* Rank */}
                <div className="w-10 text-center shrink-0">
                  {entry.rank <= 3 ? (
                    <span className="text-2xl">{MEDAL[entry.rank]}</span>
                  ) : (
                    <span className="text-lg font-bold text-muted-foreground">#{entry.rank}</span>
                  )}
                </div>

                {/* Family info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold font-heading text-sm truncate">{entry.family_name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {entry.location}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="w-3 h-3" />
                      {entry.member_count} members
                    </span>
                  </div>
                  <ScoreBar score={entry.score} />
                </div>

                {/* Score */}
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-emerald-600 font-heading">{entry.score}</p>
                  <p className="text-xs text-muted-foreground">score</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA for non-members */}
        <div className="bg-emerald-900 dark:bg-emerald-950 rounded-2xl p-6 text-center space-y-3">
          <p className="text-white font-heading font-bold text-lg">Is your family on this list?</p>
          <p className="text-emerald-300 text-sm">Plant your family's first root — free forever for founding families.</p>
          <button
            onClick={() => navigate("/")}
            className="bg-white text-emerald-900 font-semibold px-6 py-2.5 rounded-full text-sm hover:bg-emerald-50 transition-colors"
          >
            🌱 Start your family's story
          </button>
        </div>
      </div>
    </div>
  );
}
