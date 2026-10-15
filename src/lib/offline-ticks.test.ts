import { describe, expect, it } from "vitest";
import { addTick, MAX_QUEUED, parseQueue, removeTicks } from "./offline-ticks";

const a = "11111111-2222-4333-8444-555555555555";
const b = "21111111-2222-4333-8444-555555555555";

describe("ticks made offline", () => {
  it("queues a task once, however many times it is tapped", () => {
    const q = addTick(addTick([], a, "09:00"), a, "09:01");
    expect(q).toEqual([{ taskId: a, at: "09:00" }]);
    expect(addTick(q, b, "09:02").map((t) => t.taskId)).toEqual([a, b]);
  });

  it("forgets the ticks the server took and keeps the rest", () => {
    expect(removeTicks([{ taskId: a, at: "" }, { taskId: b, at: "" }], [a])).toEqual([{ taskId: b, at: "" }]);
  });

  it("reads only well-formed ticks from storage, whatever is there", () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue("not json")).toEqual([]);
    expect(parseQueue('{"taskId":"x"}')).toEqual([]);
    expect(parseQueue(JSON.stringify([{ taskId: a, at: "t" }, { taskId: a }, { taskId: "1; drop table" }, null, 3]))).toEqual([{ taskId: a, at: "t" }]);
  });

  it("never holds more than the cap", () => {
    let q = parseQueue("[]");
    for (let i = 0; i < MAX_QUEUED + 5; i++) q = addTick(q, `${String(i).padStart(8, "0")}-2222-4333-8444-555555555555`, "");
    expect(q).toHaveLength(MAX_QUEUED);
  });
});
