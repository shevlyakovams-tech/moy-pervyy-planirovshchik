import { describe, expect, it } from "vitest";
import { getCsrfToken, validateLocalMutation } from "@/lib/security";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

describe("local request protection", () => {
  it("accepts only the local origin with the process token", () => {
    const valid = new Request("http://127.0.0.1:3210/api/onboarding", { method: "POST", headers: { origin: "http://127.0.0.1:3210", "x-local-csrf": getCsrfToken() } });
    expect(validateLocalMutation(valid)).toEqual({ ok: true });
    const foreign = new Request("http://127.0.0.1:3210/api/onboarding", { method: "POST", headers: { origin: "https://example.org", "x-local-csrf": getCsrfToken() } });
    expect(validateLocalMutation(foreign)).toMatchObject({ ok: false, status: 403 });
    const missingToken = new Request("http://127.0.0.1:3210/api/onboarding", { method: "POST", headers: { origin: "http://127.0.0.1:3210" } });
    expect(validateLocalMutation(missingToken)).toMatchObject({ ok: false, status: 403 });
  });

  it("defines all mandatory browser headers", () => {
    const policy = contentSecurityPolicy("test-nonce");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("'nonce-test-nonce'");
    expect(securityHeaders["X-Content-Type-Options"]).toBe("nosniff");
    expect(securityHeaders["Referrer-Policy"]).toBe("no-referrer");
    expect(securityHeaders["X-Frame-Options"]).toBe("DENY");
  });
});
