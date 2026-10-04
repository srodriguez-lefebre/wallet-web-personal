import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  globalSearchResults,
  type GlobalSearchAction,
} from "@/lib/global-search";
import { useWallet } from "@/providers/wallet-provider";

export function GlobalSearch() {
  const navigate = useNavigate();
  const {
    dataset,
    clearRecordFilters,
    setRecordFilters,
    setAllPeriod,
    requestNewRecord,
    isAllHistoryComplete,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const openRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const results = useMemo(
    () => globalSearchResults(dataset, query),
    [dataset, query],
  );

  const changeOpen = useCallback((next: boolean) => {
    if (next && !openRef.current)
      previousFocus.current = document.activeElement as HTMLElement | null;
    openRef.current = next;
    setQuery("");
    setOpen(next);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k"
      )
        return;
      event.preventDefault();
      changeOpen(!openRef.current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeOpen]);

  function select(action: GlobalSearchAction) {
    changeOpen(false);
    if (action.type === "new-record") {
      requestNewRecord();
      navigate("/records");
    } else if (action.type === "records") {
      clearRecordFilters();
      setAllPeriod();
      setRecordFilters(action.filters);
      navigate("/records");
    } else {
      navigate(action.href);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={() => changeOpen(true)}
          aria-label="Search wallet"
          title="Search wallet (Ctrl/Cmd+K)"
        >
          <Search className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (previousFocus.current?.isConnected) {
              event.preventDefault();
              previousFocus.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Search wallet</DialogTitle>
            <DialogDescription>
              Find accounts, cards, categories, goals and investments, or open a
              quick action.
            </DialogDescription>
          </DialogHeader>
          <label className="sr-only" htmlFor="wallet-global-search">
            Search wallet or commands
          </label>
          <input
            ref={inputRef}
            id="wallet-global-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            placeholder="Search names or type a command…"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Tab to a result and press Enter. Escape closes search. Up to 20
            results.
          </p>
          {!isAllHistoryComplete ? (
            <p className="text-xs text-muted-foreground">
              Record history may be incomplete. Record shortcuts open all
              history; check the loading status in Records.
            </p>
          ) : null}
          <ul
            aria-label="Search results"
            className="max-h-[50vh] space-y-1 overflow-y-auto"
          >
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => select(result.action)}
                  className="w-full rounded-md px-3 py-2 text-left outline-none hover:bg-secondary focus:bg-secondary focus:ring-2 focus:ring-ring"
                >
                  <span className="block text-sm font-medium">
                    {result.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {result.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
