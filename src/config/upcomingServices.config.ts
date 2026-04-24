import { Sparkles, Sprout, Hourglass, CalendarDays, Radar, Archive } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Lang } from '@/i18n/translations';

export interface UpcomingService {
  id: string;
  /** Route shown while the service is in "Launching Soon" state */
  path: string;
  icon: LucideIcon;
  emoji: string;
  title: Record<Lang, string>;
  tagline: Record<Lang, string>;
  desc: Record<Lang, string>;
  /**
   * Flip to true once the real page is ready.
   * The sidebar / dashboard will then use livePath instead of the coming-soon page.
   */
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
      hi: "पारिवारिक स्वास्थ्य अंतर्दृष्टि को व्यक्तिगत जीवंतता के रोडमैप में बदलें। वंशानुगत पैटर्न समझें और अपने वंश की जड़ों में रचे स्वास्थ्य मार्गदर्शन से प्रेरित होकर बेहतर जीवन जिएं।",
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
      en: "Access the 'Legacy Voice AI' of your ancestors — a mentorship engine trained on your family's values, decisions, and historical successes. Guidance uniquely tailored to the next generation by the generation that built everything they stand on.",
      hi: "अपने पूर्वजों की 'Legacy Voice AI' तक पहुँचें — आपके परिवार के मूल्यों, निर्णयों और ऐतिहासिक सफलताओं पर आधारित मार्गदर्शन प्रणाली। अगली पीढ़ी के लिए, उस पीढ़ी द्वारा जिसने सब कुछ बनाया।",
    },
    isLive: false,
  },
  {
    id: 'time-bank',
    path: '/upcoming/time-bank',
    icon: Hourglass,
    emoji: '⌛',
    title: { en: 'Time Bank', hi: 'टाइम बैंक' },
    tagline: {
      en: 'Exchange skills and time within your kutumb',
      hi: 'अपने कुटुंब के भीतर कौशल और समय का आदान-प्रदान',
    },
    desc: {
      en: "Offer your skills and spare time to family members, or request help from those with the right expertise. Teaching, cooking, repairs, childcare — every hour you give earns you a credit to spend when you need help.",
      hi: "अपने कौशल और खाली समय को परिवार के सदस्यों को प्रदान करें, या सही विशेषज्ञता वाले सदस्यों से मदद माँगें। पढ़ाना, खाना बनाना, मरम्मत, बच्चों की देखभाल — आप जितना घंटा देते हैं, उतना क्रेडिट कमाते हैं।",
    },
    isLive: true,
    livePath: '/time-bank',
  },
  {
    id: 'kutumb-calendar',
    path: '/upcoming/kutumb-calendar',
    icon: CalendarDays,
    emoji: '📅',
    title: { en: 'Kutumb Calendar', hi: 'कुटुंब कैलेंडर' },
    tagline: {
      en: "The heartbeat of your family's tradition",
      hi: 'आपके परिवार की परंपरा का धड़कन',
    },
    desc: {
      en: "A shared, global space to synchronize sacred dates, ancestral remarks, and cultural milestones. No matter where your kin travels — across cities, countries, or continents — the entire family stays connected to its roots.",
      hi: "पवित्र तिथियों, पैतृक टिप्पणियों और सांस्कृतिक मील के पत्थरों को समन्वयित करने के लिए एक साझा, वैश्विक स्थान। आपके परिजन चाहे कहीं भी हों, पूरा परिवार अपनी जड़ों से जुड़ा रहता है।",
    },
    isLive: true,
    livePath: '/calendar',
  },
  {
    id: 'kutumb-radar',
    path: '/upcoming/kutumb-radar',
    icon: Radar,
    emoji: '📡',
    title: { en: 'Kutumb Radar', hi: 'कुटुंब रडार' },
    tagline: {
      en: 'Discover the invisible threads that connect you',
      hi: 'उन अदृश्य धागों की खोज करें जो आपको जोड़ते हैं',
    },
    desc: {
      en: "Using our Linkage Locator, securely find the shortest lineage path to potential relatives and compatible families across the globe. Total privacy is maintained — you only see what others choose to share, and they only see what you allow.",
      hi: "हमारे Linkage Locator का उपयोग करके संभावित रिश्तेदारों और संगत परिवारों का सबसे छोटा वंश-पथ सुरक्षित रूप से खोजें। पूर्ण गोपनीयता बनाए रखी जाती है।",
    },
    isLive: true,
    livePath: '/radar',
  },
  {
    id: 'legacy-box',
    path: '/upcoming/legacy-box',
    icon: Archive,
    emoji: '📦',
    title: { en: 'Legacy Box', hi: 'लेगेसी बॉक्स' },
    tagline: {
      en: "Your family's masterpiece, curated and protected",
      hi: 'आपके परिवार की उत्कृष्ट कृति, संरक्षित और सुरक्षित',
    },
    desc: {
      en: "Leave a voice or text message for a loved one — triggered automatically at a date and time you choose, or when they arrive at a special place. Your words, delivered at exactly the right moment.",
      hi: "किसी प्रियजन के लिए आवाज़ या टेक्स्ट संदेश छोड़ें — आपकी चुनी हुई तारीख और समय पर, या जब वे किसी विशेष स्थान पर पहुँचें, स्वचालित रूप से ट्रिगर हो। आपके शब्द, सही समय पर पहुँचाए जाएं।",
    },
    isLive: true,
    livePath: '/legacy-box',
  },
];
