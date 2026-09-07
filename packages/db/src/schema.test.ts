import { describe, expect, it } from "vitest";
import { accounts } from "./schema/index.js";

describe("@orbis/db schema", () => {
  it("exports accounts table", () => {
    expect(accounts).toBeDefined();
  });
});
