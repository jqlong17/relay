import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildLoginRedirect, isProtectedPath, isPublicAssetPath } from "@/lib/auth/guard";
import { isMobileUserAgent } from "@/lib/auth/device";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isMobile = isMobileUserAgent(request.headers.get("user-agent"));

  if (isPublicAssetPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/workspace" && isMobile) {
    return NextResponse.redirect(new URL(`/mobile${search}`, request.url));
  }

  const token = request.cookies.get(getSessionCookieName())?.value;
  const authenticated = await verifySessionToken(token);

  if (pathname === "/login" && authenticated) {
    return NextResponse.redirect(new URL(isMobile ? "/mobile" : "/workspace", request.url));
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (authenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  return NextResponse.redirect(new URL(buildLoginRedirect(pathname, search), request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico|webp)).*)"],
};
