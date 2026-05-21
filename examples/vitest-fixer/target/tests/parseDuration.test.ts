import { describe, expect, it } from "vitest";
import { parseDuration } from "../src/parseDuration.ts";

describe("parseDuration", () => {
  it("handles milliseconds", () => {
    expect(parseDuration("500ms")).toBe(500);
  });

  it("handles seconds", () => {
    expect(parseDuration("2s")).toBe(2000);
  });

  it("handles minutes", () => {
    expect(parseDuration("3m")).toBe(180_000);
  });

  it("handles hours", () => {
    expect(parseDuration("1h")).toBe(3_600_000);
  });

  it("throws on invalid input", () => {
    expect(() => parseDuration("not a duration")).toThrow();
  });
});
