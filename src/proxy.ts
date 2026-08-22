import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export const config = { matcher: "/:path*" };
