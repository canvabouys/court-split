import type { CookieOptions } from "hono/utils/cookie";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

/** The native mobile app calls the API cross-site from its WebView origin. */
function isNativeAppRequest(headers: Headers): boolean {
  const origin = headers.get("origin") || "";
  return (
    origin === "capacitor://localhost" ||
    ((origin === "https://localhost" || origin === "http://localhost") &&
      !isLocalhost(headers))
  );
}

export function getSessionCookieOptions(headers: Headers): CookieOptions {
  // Cross-site (native app) requests need SameSite=None + Secure so the
  // WebView actually sends the access cookies back to the API.
  if (isNativeAppRequest(headers)) {
    return { httpOnly: true, path: "/", sameSite: "None", secure: true };
  }

  const localhost = isLocalhost(headers);

  return {
    httpOnly: true,
    path: "/",
    sameSite: localhost ? "Lax" : "None",
    secure: !localhost,
  };
}
