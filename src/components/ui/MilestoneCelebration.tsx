import { useEffect, useRef } from 'react';
import { X, Share2, Award } from 'lucide-react';

interface MilestoneCelebrationProps {
  familyName: string;
  milestoneKey: 'firstBranch' | 'threeGen' | 'panditVerified' | 'fiftyMembers';
  onDismiss: () => void;
  shareUrl?: string;
}

const MILESTONE_META = {
  firstBranch: {
    emoji: '🌱',
    title: 'Pehli Shaakh Phoot Gayi!',
    subtitle: 'Your family\'s first branch has grown.',
    badge: 'Harit Parivar',
    color: 'from-green-700 to-emerald-600',
  },
  threeGen: {
    emoji: '🌳',
    title: 'Teen Peedhiyaan!',
    subtitle: '3 generations of your family are now alive on Prakriti.',
    badge: 'Teen Peedhiyaan',
    color: 'from-green-800 to-teal-600',
  },
  panditVerified: {
    emoji: '🏅',
    title: 'Prakriti Margdarshak Certified!',
    subtitle: 'Your family lineage is now verified and honoured.',
    badge: 'Verified Vansha',
    color: 'from-amber-700 to-orange-600',
  },
  fiftyMembers: {
    emoji: '🌲',
    title: 'Maha Vansha!',
    subtitle: '50 members strong — your forest is thriving.',
    badge: 'Maha Vansha',
    color: 'from-emerald-800 to-green-600',
  },
};

const CONFETTI_COLORS = [
  '#4ade80', '#22c55e', '#fbbf24', '#f59e0b',
  '#86efac', '#fde68a', '#6ee7b7', '#fcd34d',
];

function Confetti() {
  const count = 48;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const left = `${Math.random() * 100}%`;
        const delay = `${Math.random() * 0.8}s`;
        const duration = `${1.2 + Math.random() * 1.2}s`;
        const size = `${6 + Math.random() * 8}px`;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const rotate = `${Math.random() * 360}deg`;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left,
              top: '-10px',
              width: size,
              height: size,
              background: color,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              transform: `rotate(${rotate})`,
              animation: `confettiFall ${duration} ${delay} ease-in forwards`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default function MilestoneCelebration({
  familyName,
  milestoneKey,
  onDismiss,
  shareUrl,
}: MilestoneCelebrationProps) {
  const meta = MILESTONE_META[milestoneKey];
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timerRef.current);
  }, [onDismiss]);

  function handleWhatsAppShare() {
    const url = shareUrl ?? window.location.href;
    const message =
      `🌳 *${familyName} parivaar — ${meta.badge}!*\n\n` +
      `${meta.subtitle}\n\n` +
      `_"When the last elder goes, the whole forest falls."_\n` +
      `Lekin aaj humne apna paudha lagaya. 🌱\n\n` +
      `Apne parivaar ki Prakriti claim karo — free:\n${url}\n\n` +
      `*Prakriti* — India's Family Nature Score`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <Confetti />

      <div className={`relative w-full max-w-sm rounded-3xl bg-gradient-to-br ${meta.color} text-white shadow-2xl overflow-hidden`}>
        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="px-8 pt-10 pb-8 text-center">
          <div className="text-6xl mb-4">{meta.emoji}</div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold mb-4">
            <Award className="w-3 h-3" />
            {meta.badge}
          </div>

          <h2 className="font-heading text-2xl font-bold mb-2 leading-tight">
            {familyName} Parivaar
          </h2>
          <p className="text-white/80 text-sm leading-relaxed mb-1 font-medium">
            {meta.title}
          </p>
          <p className="text-white/65 text-xs leading-relaxed mb-8">
            {meta.subtitle}
          </p>

          {/* Banyan silhouette */}
          <div className="flex justify-center mb-6 opacity-20">
            <svg viewBox="0 0 120 80" className="w-24 h-16" fill="white">
              <path d="M60 5 C55 15 44 25 34 40 C24 55 18 65 20 75 L100 75 C102 65 96 55 86 40 C76 25 65 15 60 5Z" />
              <rect x="56" y="58" width="8" height="17" rx="2" />
            </svg>
          </div>

          <button
            onClick={handleWhatsAppShare}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold text-sm transition-colors shadow-lg mb-3"
          >
            <Share2 className="w-4 h-4" />
            WhatsApp par share karo 🌳
          </button>

          <button
            onClick={onDismiss}
            className="text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            Baad mein share karenge
          </button>
        </div>
      </div>
    </div>
  );
}
