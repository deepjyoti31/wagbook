import { describe, expect, it } from "vitest";
import { formatBytes } from "./sizes";

describe("formatBytes", () => {
  it("says a size in the largest unit that fits", () => {
    expect(formatBytes(500)).toBe("500 byte");
    expect(formatBytes(820 * 1024)).toBe("820 kB");
    expect(formatBytes(18.44 * 1024 * 1024)).toBe("18 MB");
    expect(formatBytes(1.25 * 1024 * 1024)).toBe("1.3 MB");
    expect(formatBytes(1.2 * 1024 ** 3)).toBe("1.2 GB");
  });
});
