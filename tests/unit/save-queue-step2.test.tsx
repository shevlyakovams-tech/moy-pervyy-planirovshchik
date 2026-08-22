// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSaveQueue } from "@/components/planner-ui";

describe("autosave mutation queue", () => {
  afterEach(() => vi.useRealTimers());

  it("debounces a field for 600ms and keeps only its newest value", async () => {
    vi.useFakeTimers();
    const values: string[] = [];
    const { result } = renderHook(() => useSaveQueue());
    act(() => {
      result.current.schedule("field", async () => { values.push("old"); });
      result.current.schedule("field", async () => { values.push("new"); });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(values).toEqual(["new"]);
    expect(result.current.status).toBe("saved");
  });

  it("runs mutations sequentially and can retry a failed save", async () => {
    const order: string[] = [];
    let fail = true;
    const { result } = renderHook(() => useSaveQueue());
    await act(async () => {
      void result.current.enqueue(async () => { order.push("first-start"); await Promise.resolve(); order.push("first-end"); });
      await result.current.enqueue(async () => { order.push("second"); if (fail) throw new Error("offline"); });
    });
    expect(order).toEqual(["first-start", "first-end", "second"]);
    expect(result.current.status).toBe("error");
    fail = false;
    await act(async () => { await result.current.retry(); });
    expect(order).toEqual(["first-start", "first-end", "second", "second"]);
    expect(result.current.status).toBe("saved");
  });
});
