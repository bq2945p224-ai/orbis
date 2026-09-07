import { describe, expect, it } from "vitest";
import { advanceWorldClock, publishOutbox } from "./clock.js";

describe("clock helpers", () => {
  it("exports advanceWorldClock and publishOutbox", () => {
    expect(typeof advanceWorldClock).toBe("function");
    expect(typeof publishOutbox).toBe("function");
  });
});
