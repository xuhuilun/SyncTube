/**
 * Client-side Bilibili auth helpers.
 *
 * Privacy model: Bilibili credentials (SESSDATA etc.) are stored exclusively
 * in the browser — localStorage for fetch calls that can set custom headers,
 * and a non-httpOnly cookie for the <video> stream proxy (which can't).
 *
 * The server is a stateless proxy: it receives SESSDATA transiently for API
 * calls but never persists it to disk, database, or memory.
 */

export interface BiliAuth {
  SESSDATA: string;
  biliJct: string;
  dedeUserId: string;
}

export interface BiliUser {
  uid: number;
  uname: string;
  face: string;
}

const AUTH_KEY = "bili_auth";
const USER_KEY = "bili_user";
const COOKIE_NAME = "bili_sessdata";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// ---- Auth storage (SESSDATA for API calls) ----

export function saveBiliAuth(auth: BiliAuth): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  // Set a non-httpOnly cookie for the stream proxy route (the <video> element
  // can't set custom headers, so the cookie is the only way to pass SESSDATA).
  document.cookie = `${COOKIE_NAME}=${auth.SESSDATA}; path=/api/bilibili; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function loadBiliAuth(): BiliAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BiliAuth;
  } catch {
    return null;
  }
}

export function clearBiliAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = `${COOKIE_NAME}=; path=/api/bilibili; max-age=0; SameSite=Lax`;
}

/** Returns a headers object with the SESSDATA header for fetch calls. */
export function getBiliSessdataHeader(): Record<string, string> {
  const auth = loadBiliAuth();
  return auth ? { "x-bili-sessdata": auth.SESSDATA } : {};
}

// ---- User info storage (display only, non-sensitive) ----

export function saveBiliUser(user: BiliUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function loadBiliUser(): BiliUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BiliUser;
  } catch {
    return null;
  }
}

// ---- Server proxy call (fetches user info via stateless API route) ----

export async function fetchBiliUser(sessdata: string): Promise<BiliUser | null> {
  try {
    const res = await fetch("/api/bilibili/user", {
      headers: { "x-bili-sessdata": sessdata },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return { uid: data.uid, uname: data.uname, face: data.face };
  } catch {
    return null;
  }
}
