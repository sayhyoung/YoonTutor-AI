"use client";

import type { AppUser } from "../types";

const APP_USER_KEY = "yoon-ai-tutor:app-user";
const APP_USER_EVENT = "yoon-ai-tutor:app-user-change";

// Cache by raw string so getStoredAppUser returns a stable reference between
// renders (required by useSyncExternalStore to avoid infinite re-render loops).
let cachedRaw: string | null = null;
let cachedUser: AppUser | null = null;

export function getStoredAppUser(): AppUser | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(APP_USER_KEY);
  if (raw === cachedRaw) return cachedUser;

  cachedRaw = raw;
  try {
    cachedUser = raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    cachedUser = null;
  }
  return cachedUser;
}

export function writeStoredAppUser(user: AppUser | null) {
  if (typeof window === "undefined") return;

  if (user) {
    window.localStorage.setItem(APP_USER_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(APP_USER_KEY);
  }
  // storage events don't fire in the same tab, so notify listeners directly.
  window.dispatchEvent(new Event(APP_USER_EVENT));
}

export function subscribeAppUser(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(APP_USER_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(APP_USER_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
