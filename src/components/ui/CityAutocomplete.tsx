import { useState, useRef, useEffect } from 'react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

function buildCityLabel(r: NominatimResult): string {
  const a = r.address;
  const place = a.city || a.town || a.village || a.suburb || a.county || '';
  const state = a.state || '';
  return [place, state].filter(Boolean).join(', ');
}

interface CityAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

/**
 * Debounced city autocomplete backed by Nominatim (OpenStreetMap).
 * Filters to India. Falls back gracefully — user can always type freely.
 */
export function CityAutocomplete({
  value,
  onChange,
  className,
  placeholder,
  required,
  id,
}: CityAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync external value (e.g. draft restore / auto-fill)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    // Cancel previous request
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setFetching(true);
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(q)}` +
      `&format=json&addressdetails=1&countrycodes=in&limit=7` +
      `&accept-language=en`;

    fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'KutumbSangam/1.0' },
    })
      .then((r) => r.json())
      .then((results: NominatimResult[]) => {
        const labels = [
          ...new Set(results.map(buildCityLabel).filter(Boolean)),
        ];
        setSuggestions(labels);
        setOpen(labels.length > 0);
      })
      .catch(() => {
        /* network / abort — let user type freely */
      })
      .finally(() => setFetching(false));
  };

  const handleChange = (v: string) => {
    setQuery(v);
    onChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(v), 350);
  };

  const handleSelect = (label: string) => {
    setQuery(label);
    onChange(label);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={className}
      />
      {fetching && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground animate-pulse">
          …
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl overflow-hidden text-sm">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={() => handleSelect(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-secondary/60 font-body text-sm transition-colors flex items-center gap-2"
              >
                <span className="text-base">📍</span>
                <span>{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CityAutocomplete;
