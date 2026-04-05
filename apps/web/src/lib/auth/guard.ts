const PUBLIC_FILE_PATTERN = /\.[^/]+$/;

const PUBLIC_PAGE_PREFIXES = ["/", "/about", "/readme", "/login", "/auth/callback"];
const PROTECTED_PAGE_PREFIXES = ["/workspace", "/sessions", "/memories", "/automation", "/settings", "/mobile"];
const PUBLIC_API_PREFIXES = ["/api/auth"];
const PROTECTED_API_PREFIXES = ["/api/bridge", "/api/codex-automations", "/api/ui-config"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPublicAssetPath(pathname: string) {
  return pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/icon") || PUBLIC_FILE_PATTERN.test(pathname);
}

export function isProtectedPath(pathname: string) {
  if (matchesPrefix(pathname, PROTECTED_API_PREFIXES)) {
    return true;
  }

  return matchesPrefix(pathname, PROTECTED_PAGE_PREFIXES);
}

export function isPublicPath(pathname: string) {
  if (isPublicAssetPath(pathname)) {
    return true;
  }

  return matchesPrefix(pathname, PUBLIC_PAGE_PREFIXES) || matchesPrefix(pathname, PUBLIC_API_PREFIXES);
}

export function buildLoginRedirect(pathname: string, search: string) {
  const next = pathname === "/login" ? "/workspace" : `${pathname}${search}`;
  return `/login?next=${encodeURIComponent(next)}`;
}
