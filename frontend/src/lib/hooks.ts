"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Debounce a value — only updates after `delay` ms of inactivity.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Screen Wake Lock — keeps the display on while active.
 * Returns { supported, active, request, release }.
 */
export function useWakeLock() {
  const [supported] = useState(() => "wakeLock" in navigator);
  const [active, setActive] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  async function request() {
    if (!supported) return;
    try {
      lockRef.current = await navigator.wakeLock.request("screen");
      setActive(true);
      lockRef.current.addEventListener("release", () => setActive(false));
    } catch {
      // permission denied or page not visible
    }
  }

  async function release() {
    try {
      await lockRef.current?.release();
      lockRef.current = null;
      setActive(false);
    } catch {
      // ignore
    }
  }

  // Re-acquire on visibility change (browser auto-releases on tab switch)
  useEffect(() => {
    if (!active) return;
    function onVisible() {
      if (document.visibilityState === "visible" && !lockRef.current) {
        request();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  return { supported, active, request, release };
}

/**
 * Local storage state hook with SSR safety.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [stored, setStored] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  function setValue(value: T | ((val: T) => T)) {
    try {
      const next = value instanceof Function ? value(stored) : value;
      setStored(next);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  return [stored, setValue] as const;
}
