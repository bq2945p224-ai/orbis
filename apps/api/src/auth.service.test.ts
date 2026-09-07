import { describe, expect, it } from "vitest";
import { AuthService } from "./auth/auth.service.js";

describe("auth token hashing", () => {
  it("hashes deterministically", () => {
    const svc = Object.create(AuthService.prototype) as AuthService;
    const a = svc.hashToken("abc");
    const b = svc.hashToken("abc");
    const c = svc.hashToken("abcd");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});
