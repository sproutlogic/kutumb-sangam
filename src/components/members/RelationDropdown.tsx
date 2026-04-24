import { useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KUTUMB_RELATION_OPTIONS } from "@/constants/vrukshaRelations";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type Props = {
  value: string;
  onChange: (relation: string) => void;
  /** Defaults to full Kutumb list; use {@link ANCESTRAL_ADD_RELATION_OPTIONS} for parent-link-only adds. */
  options?: readonly string[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
};

/**
 * Relation picker — same control for Add and Edit member (Kutumb Map).
 * Unknown stored values (e.g. legacy "self") appear at the top so the current value stays selectable.
 */
export function RelationDropdown({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Select relation…",
  className,
  id,
}: Props) {
  const label = value.trim() ? value : placeholder;
  const list = options ?? KUTUMB_RELATION_OPTIONS;

  const extraFirst = useMemo(() => {
    const v = value.trim();
    if (!v || list.includes(v)) return null;
    return v;
  }, [value, list]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-4 py-2.5 text-left text-sm font-body shadow-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !value.trim() && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[min(320px,70vh)] overflow-y-auto z-50">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => v && onChange(v)}>
          {extraFirst && (
            <>
              <DropdownMenuRadioItem value={extraFirst} className="font-body">
                {extraFirst}
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
            </>
          )}
          {options
            ? list.map((opt) => (
                <DropdownMenuRadioItem key={opt} value={opt} className="font-body">
                  {opt}
                </DropdownMenuRadioItem>
              ))
            : (
              <>
                {KUTUMB_RELATION_OPTIONS.slice(0, 6).map((opt) => (
                  <DropdownMenuRadioItem key={opt} value={opt} className="font-body">
                    {opt}
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuSeparator />
                {KUTUMB_RELATION_OPTIONS.slice(6, 8).map((opt) => (
                  <DropdownMenuRadioItem key={opt} value={opt} className="font-body">
                    {opt}
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuSeparator />
                {KUTUMB_RELATION_OPTIONS.slice(8).map((opt) => (
                  <DropdownMenuRadioItem key={opt} value={opt} className="font-body">
                    {opt}
                  </DropdownMenuRadioItem>
                ))}
              </>
            )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
