import { Capacitor } from "@capacitor/core";

const API_BASE_KEY = "cs_api_base";

/** True when running inside the native Android/iOS shell. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** The user-configured backend origin (native app only), e.g. https://courtsplit.example.com */
export function getApiBase(): string | null {
  try {
    const raw = localStorage.getItem(API_BASE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim().replace(/\/+$/, "");
    return /^https?:\/\/.+/.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

export function setApiBase(url: string): void {
  localStorage.setItem(API_BASE_KEY, url.trim().replace(/\/+$/, ""));
}

export function clearApiBase(): void {
  localStorage.removeItem(API_BASE_KEY);
}

/** URL the tRPC client should talk to. Same-origin in the browser; configurable in the app. */
export function trpcUrl(): string {
  const base = getApiBase();
  return base ? `${base}/api/trpc` : "/api/trpc";
}

/** In the native app we must know the server before any data can load. */
export function needsServerSetup(): boolean {
  return isNativeApp() && !getApiBase();
}
