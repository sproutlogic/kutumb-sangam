import { Sparkles, Sprout } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Lang } from '@/i18n/translations';

export interface UpcomingService {
  id: string;
  path: string;
  icon: LucideIcon;
  emoji: string;
  title: Record<Lang, string>;
  tagline: Record<Lang, string>;
  desc: Record<Lang, string>;
  isLive: boolean;
  livePath?: string;
}

export const UPCOMING_SERVICES: UpcomingService[] = [
  {
    id: 'zindagi-plus',
    path: '/upcoming/zindagi-plus',
    icon: Sparkles,
    emoji: '✨',
    title: { en: 'Zindagi+', hi: 'ज़िंदगी+' },
    tagline: {
      en: 'Where your biological heritage meets modern longevity',
      hi: 'जहाँ आपकी जैविक विरासत आधुनिक दीर्घायु से मिलती है',
    },
    desc: {
      en: "Turn ancestral health insights into a personalized roadmap for vitality. Understand hereditary patterns, receive proactive guidance rooted in your lineage, and live your best life while honoring those who came before you.",
      hi: "पारिवारिक स्वास्थ्य अंतर्दृष्टि को व्यक्तिगत जीवंतता के रोडमैप में बदलें।",
    },
    isLive: false,
  },
  {
    id: 'growth-hub',
    path: '/upcoming/growth-hub',
    icon: Sprout,
    emoji: '🌱',
    title: { en: 'Growth Hub', hi: 'ग्रोथ हब' },
    tagline: {
      en: "The bridge between ancestral wisdom and youthful ambition",
      hi: 'पुरखों की बुद्धि और युवा महत्वाकांक्षा के बीच सेतु',
    },
    desc: {
      en: "Access the 'Legacy Voice AI' of your ancestors — a mentorship engine trained on your family's values, decisions, and historical successes.",
      hi: "अपने पूर्वजों की 'Legacy Voice AI' तक पहुँचें — आपके परिवार के मूल्यों पर आधारित मार्गदर्शन प्रणाली।",
    },
    isLive: false,
  },
];
