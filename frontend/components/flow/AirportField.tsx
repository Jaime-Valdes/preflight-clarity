"use client";

import { PenLine } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { getAirport, POPULAR_AIRPORT_CODES, searchAirports } from "@preflight/shared/airports";
import type { Airport } from "@preflight/shared/types";
import { cn } from "@/lib/cn";

interface AirportFieldProps {
  id: string;
  label: ReactNode;
  /** Stored value: an IATA code when an airport was picked, otherwise trimmed free text, "" when empty. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Quiet line under the field (validation or help). */
  hint?: ReactNode;
  /** The hint is a validation message: sets aria-invalid and announces the hint. */
  invalid?: boolean;
  /** Show popular airports as one-tap chips while the field is empty. */
  quickPicks?: boolean;
  /** Something rendered at the right of the label row (e.g. a swap button). */
  labelAction?: ReactNode;
  className?: string;
}

type Option = { kind: "airport"; airport: Airport } | { kind: "text"; text: string };

const MAX_RESULTS = 6;
/** Five chips fit on one row at 390px. */
const MAX_QUICK_PICKS = 5;

/** "New York (JFK)" for a known code, otherwise the free text itself. */
export function airportLabel(value: string): string {
  if (!value) return "";
  const airport = getAirport(value);
  return airport ? `${airport.city} (${airport.code})` : value;
}

/**
 * Accessible combobox over the shared airport list. Picking a suggestion
 * stores the IATA code; typing something that matches nothing stores the
 * trimmed text (the generator synthesizes an airport for it).
 */
export function AirportField({
  id,
  label,
  value,
  onChange,
  placeholder = "City or airport",
  hint,
  invalid = false,
  quickPicks = true,
  labelAction,
  className,
}: AirportFieldProps) {
  const listId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  /** Text being typed; null while not editing (the field shows the stored value's label). */
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const typedRef = useRef(false);
  /** Whether the participant has typed since focusing (the pre-filled label is not a search query). */
  const [typed, setTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const editing = draft !== null;
  const text = editing ? draft : airportLabel(value);
  const query = editing && typed ? draft : "";
  const options: Option[] = buildOptions(query);
  const showList = open && editing && options.length > 0;

  function setDraftBoth(next: string | null) {
    draftRef.current = next;
    setDraft(next);
  }

  function commitText(raw: string) {
    const trimmed = raw.trim();
    if (!typedRef.current || trimmed === airportLabel(value)) return;
    if (!trimmed) {
      if (value) onChange("");
      return;
    }
    // A 3-letter partial ("los", "san") means the city the list ranks first (what Enter
    // would pick), not an accidental code match (Lagos, San Diego). A code typed in
    // caps, or one that is itself the top result ("BOS"), stays a code.
    const code = getAirport(trimmed);
    const top = /^[A-Za-z]{3}$/.test(trimmed) ? searchAirports(trimmed, 1)[0] : undefined;
    const typedAsCode = trimmed === trimmed.toUpperCase();
    const known = code && (typedAsCode || top?.code === code.code) ? code : top;
    onChange(known ? known.code : trimmed.slice(0, 60));
  }

  function select(option: Option) {
    setDraftBoth(null);
    setOpen(false);
    setActive(-1);
    onChange(option.kind === "airport" ? option.airport.code : option.text);
    inputRef.current?.blur();
  }

  function setTypedBoth(next: boolean) {
    typedRef.current = next;
    setTyped(next);
  }

  function onFocus(e: FocusEvent<HTMLInputElement>) {
    setDraftBoth(airportLabel(value));
    setTypedBoth(false);
    setOpen(true);
    setActive(-1);
    e.target.select();
  }

  function onBlur() {
    const pending = draftRef.current;
    if (pending !== null) commitText(pending);
    setDraftBoth(null);
    setTypedBoth(false);
    setOpen(false);
    setActive(-1);
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    setDraftBoth(e.target.value);
    setTypedBoth(true);
    setOpen(true);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        setActive(options.length ? (active + 1) % options.length : -1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        setActive(options.length ? (active - 1 + options.length) % options.length : -1);
        break;
      case "Enter": {
        e.preventDefault();
        const pick = active >= 0 ? options[active] : showList ? options[0] : undefined;
        if (pick) select(pick);
        else inputRef.current?.blur();
        break;
      }
      case "Tab":
        // Keyboard highlight + Tab picks the highlighted option (hover never sets this path).
        if (showList && active >= 0) {
          const pick = options[active];
          // draftRef is null before the native blur, so onBlur won't commit the raw text.
          setDraftBoth(null);
          setOpen(false);
          setActive(-1);
          onChange(pick.kind === "airport" ? pick.airport.code : pick.text);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        }
        break;
      default:
        break;
    }
  }

  const chips = quickPicks && !value && !editing ? POPULAR_AIRPORT_CODES.slice(0, MAX_QUICK_PICKS) : [];

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold text-ink-700">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={placeholder}
          value={text}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={onInput}
          onKeyDown={onKeyDown}
          className="h-12 w-full rounded-2xl bg-surface px-4 text-[15px] text-ink-900 shadow-soft ring-1 ring-inset ring-line-strong placeholder:text-ink-400 focus:ring-2 focus:ring-breeze-500 focus:outline-none"
        />
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Airport suggestions"
            className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-y-auto rounded-2xl bg-surface p-1.5 shadow-lift ring-1 ring-line"
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((opt, i) => {
              const isActive = i === active;
              const key = opt.kind === "airport" ? opt.airport.code : "__text";
              return (
                <li
                  key={key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => select(opt)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left",
                    isActive ? "bg-canvas" : "hover:bg-canvas",
                  )}
                >
                  {opt.kind === "airport" ? (
                    <>
                      <span className="w-11 shrink-0 rounded-lg bg-breeze-50 py-1 text-center text-xs font-bold text-breeze-700 ring-1 ring-inset ring-breeze-100 tabular-nums">
                        {opt.airport.code}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink-900">
                          {opt.airport.city}
                        </span>
                        <span className="block truncate text-xs text-ink-500">{opt.airport.name}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex w-11 shrink-0 justify-center text-ink-400">
                        <PenLine aria-hidden className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink-900">
                          Use &ldquo;{opt.text}&rdquo;
                        </span>
                        <span className="block text-xs text-ink-500">Not in our list — that&rsquo;s fine</span>
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {chips.length ? (
        <div role="group" className="mt-2 flex flex-wrap gap-2" aria-label="Popular airports">
          {chips.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onChange(code)}
              aria-label={`${code}, ${getAirport(code)?.city ?? code}`}
              // before:-inset-y-1 pads the hit area to 44px without changing the chip's size.
              className="relative h-9 rounded-full before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] bg-surface px-3.5 text-[13px] font-semibold text-ink-700 ring-1 ring-inset ring-line-strong transition-colors hover:bg-canvas active:bg-line/60"
            >
              {code}
            </button>
          ))}
        </div>
      ) : null}
      {hint ? (
        <p id={hintId} role={invalid ? "alert" : undefined} className="mt-1.5 text-[13px] leading-snug text-sand-700">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function buildOptions(query: string): Option[] {
  const trimmed = query.trim();
  const matches = searchAirports(trimmed, MAX_RESULTS).map((airport): Option => ({ kind: "airport", airport }));
  if (trimmed && matches.length === 0) return [{ kind: "text", text: trimmed.slice(0, 60) }];
  return matches;
}
