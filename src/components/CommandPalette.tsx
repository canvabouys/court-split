import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  CalendarDays,
  CalendarPlus,
  Home,
  UserRound,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { CreateBookingDialog } from "@/components/CreateBookingDialog";
import { sportEmoji } from "@contracts/sports";
import { trpc } from "@/providers/trpc";
import { useAccess } from "@/hooks/useAccess";
import { gameDayLabel } from "@/lib/format";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { isAdmin, isRoute } = useAccess();
  const [query, setQuery] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);

  const canEdit = isAdmin || isRoute;

  const debounced = useDebounced(query, 200);
  const { data: results } = trpc.search.query.useQuery(
    { q: debounced },
    { enabled: debounced.length >= 2 },
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const hasResults = useMemo(
    () => results && results.bookings.length > 0,
    [results],
  );

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <CommandInput
          placeholder="Search or jump to…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {debounced.length >= 2 ? "No results found." : "Type to search games."}
          </CommandEmpty>

          {hasResults ? (
            <>
              {results!.bookings.length > 0 && (
                <CommandGroup heading="Games">
                  {results!.bookings.map((b) => (
                    <CommandItem key={`b${b.id}`} onSelect={() => go(`/bookings/${b.id}`)}>
                      <span className="mr-2">{sportEmoji(b.sport)}</span>
                      {b.venue}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {gameDayLabel(new Date(b.startsAt))}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandSeparator />
            </>
          ) : null}

          {canEdit && (
            <CommandGroup heading="Actions">
              <CommandItem
                onSelect={() => {
                  onOpenChange(false);
                  setBookingOpen(true);
                }}
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                New booking
              </CommandItem>
            </CommandGroup>
          )}

          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => go("/")}>
              <Home className="mr-2 h-4 w-4" /> Dashboard
            </CommandItem>
            <CommandItem onSelect={() => go("/games")}>
              <CalendarDays className="mr-2 h-4 w-4" /> Games
            </CommandItem>
            {canEdit && (
              <CommandItem onSelect={() => go("/profile")}>
                <UserRound className="mr-2 h-4 w-4" /> Profile
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {canEdit && (
        <CreateBookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />
      )}
    </>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
