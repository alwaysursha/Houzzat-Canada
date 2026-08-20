"use client";

/**
 * Lazy AddressAutocomplete — keeps the visible search shell on first paint and
 * loads the heavy module on focus / idle (shared by Home hero + site header).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

type AutocompleteModule = typeof import("@/components/listings/AddressAutocomplete");
type AutocompleteComponent = AutocompleteModule["AddressAutocomplete"];
type AutocompleteProps = ComponentProps<AutocompleteComponent>;

let autocompleteModulePromise: Promise<AutocompleteComponent> | null = null;

function loadAddressAutocomplete(): Promise<AutocompleteComponent> {
  if (!autocompleteModulePromise) {
    autocompleteModulePromise = import(
      "@/components/listings/AddressAutocomplete"
    ).then((mod) => mod.AddressAutocomplete);
  }
  return autocompleteModulePromise;
}

function SearchShellInput({
  placeholder,
  inputClassName,
  initialQuery,
  inputId,
  onActivate,
  onQueryChange,
}: {
  placeholder?: string;
  inputClassName?: string;
  initialQuery?: string;
  inputId: string;
  onActivate: () => void;
  onQueryChange?: (value: string) => void;
}) {
  return (
    <Input
      id={inputId}
      value={initialQuery ?? ""}
      placeholder={placeholder}
      className={cn(inputClassName)}
      autoComplete="off"
      data-lazy-ac-shell=""
      onFocus={() => onActivate()}
      onClick={() => onActivate()}
      onChange={(event) => {
        onQueryChange?.(event.target.value);
        onActivate();
      }}
      aria-label={placeholder ?? "Search"}
    />
  );
}

export function LazyAddressAutocomplete(props: AutocompleteProps) {
  const [Comp, setComp] = useState<AutocompleteComponent | null>(null);
  const mountingRef = useRef(false);
  const focusAfterLoadRef = useRef(false);
  const inputId = useId();

  const ensureLoaded = useCallback(() => {
    if (Comp || mountingRef.current) return;
    mountingRef.current = true;
    void loadAddressAutocomplete()
      .then((loaded) => {
        setComp(() => loaded);
      })
      .finally(() => {
        mountingRef.current = false;
      });
  }, [Comp]);

  useEffect(() => {
    return scheduleAfterFirstPaint(
      () => {
        void loadAddressAutocomplete().then((loaded) => {
          setComp(() => loaded);
        });
      },
      { timeoutMs: 2_200 },
    );
  }, []);

  useEffect(() => {
    if (!Comp || !focusAfterLoadRef.current) return;
    focusAfterLoadRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const root =
        document.getElementById(inputId) ??
        document.querySelector("[data-search-bar] input");
      if (root instanceof HTMLInputElement) root.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [Comp, inputId]);

  if (!Comp) {
    return (
      <SearchShellInput
        inputId={inputId}
        placeholder={props.placeholder}
        inputClassName={props.inputClassName}
        initialQuery={props.initialQuery}
        onQueryChange={props.onQueryChange}
        onActivate={() => {
          focusAfterLoadRef.current = true;
          ensureLoaded();
        }}
      />
    );
  }

  return <Comp {...props} />;
}

/** @deprecated Prefer LazyAddressAutocomplete — alias kept for Home hero call sites. */
export const HomeHeroAddressAutocomplete = LazyAddressAutocomplete;
