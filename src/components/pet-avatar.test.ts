import { describe, expect, it } from "vitest";
import { avatarTone } from "./pet-avatar";

describe("avatarTone", () => {
  it("gives the same name the same colour, whatever its case or spaces", () => {
    expect(avatarTone("Bruno")).toBe(avatarTone(" bruno "));
  });

  it("stays within the seven colours", () => {
    for (const name of ["", "Coco", "Simba", "Luna", "Max", "बिस्कुट", "ಟೈಗರ್"]) {
      const tone = avatarTone(name);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(7);
    }
  });

  it("does not paint every pet the same", () => {
    const tones = new Set(["Coco", "Simba", "Luna", "Max", "Bella", "Rocky", "Milo", "Daisy", "Oreo", "Tiger"].map(avatarTone));
    expect(tones.size).toBeGreaterThan(2);
  });
});
