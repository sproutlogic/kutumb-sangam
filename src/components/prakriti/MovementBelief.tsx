import { Globe2, Megaphone, Sprout } from "lucide-react";

type MovementBeliefProps = {
  variant?: "dark" | "soft" | "compact";
  cta?: {
    label: string;
    onClick: () => void;
  };
};

export function MovementBelief({ variant = "soft", cta }: MovementBeliefProps) {
  const isDark = variant === "dark";
  const isCompact = variant === "compact";

  return (
    <section
      className={[
        "border-y px-6 text-center",
        isCompact ? "py-4" : "py-12 md:py-16",
        isDark
          ? "border-stone-800 bg-stone-950 text-stone-100"
          : "border-border/50 bg-secondary/30 text-foreground",
      ].join(" ")}
    >
      <div className={isCompact ? "mx-auto max-w-4xl" : "mx-auto max-w-2xl"}>
        <div className="mb-4 flex items-center justify-center gap-2">
          {isCompact ? (
            <Megaphone className={isDark ? "h-4 w-4 text-amber-400" : "h-4 w-4 text-primary"} />
          ) : (
            <Globe2 className={isDark ? "h-8 w-8 text-amber-400" : "h-8 w-8 text-primary"} />
          )}
          <p
            className={[
              "font-body text-xs font-semibold uppercase tracking-[0.25em]",
              isDark ? "text-stone-500" : "text-muted-foreground",
            ].join(" ")}
          >
            The founding belief
          </p>
        </div>
        <blockquote
          className={[
            "font-heading font-bold leading-snug",
            isCompact ? "text-base md:text-lg" : "text-xl md:text-3xl",
            isDark ? "text-amber-400" : "text-foreground",
          ].join(" ")}
        >
          Indian families do not lack love. They lack infrastructure.
        </blockquote>
        <p
          className={[
            "mx-auto mt-3 font-body leading-relaxed",
            isCompact ? "max-w-3xl text-sm" : "max-w-xl text-base md:text-lg",
            isDark ? "text-stone-400" : "text-muted-foreground",
          ].join(" ")}
        >
          WhatsApp groups are not infrastructure. Memory fades. Elders leave. Prakriti makes family identity
          permanent, portable, and visible as a movement.
        </p>
        {cta && (
          <button
            type="button"
            onClick={cta.onClick}
            className={[
              "mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-body text-sm font-semibold transition-all hover:-translate-y-0.5",
              isDark
                ? "bg-amber-500 text-stone-950 hover:bg-amber-400"
                : "gradient-hero text-primary-foreground shadow-warm hover:opacity-90",
            ].join(" ")}
          >
            <Sprout className="h-4 w-4" />
            {cta.label}
          </button>
        )}
      </div>
    </section>
  );
}
