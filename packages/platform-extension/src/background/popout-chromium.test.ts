import { describe, expect, it, vi } from "vitest";
import { loadBackground, pageSender } from "../test/test-harness";

describe("POPOUT_OPEN Chromium compatibility", () => {
	it("falls back to a normal window when popup windows are rejected", async () => {
		const bg = await loadBackground();
		let attempts = 0;
		bg.chrome.windows.create = vi.fn(async (opts: Record<string, unknown>) => {
			bg.state.windowsCreated.push(opts);
			attempts += 1;
			if (attempts < 3) throw new Error("Popup windows are unavailable");
			return { id: 999 };
		});

		const { resp } = await bg.send(
			{ type: "POPOUT_OPEN", payload: {} },
			pageSender("example.com", 4),
		);

		expect(resp).toEqual({ ok: true });
		expect(bg.state.windowsCreated).toHaveLength(3);
		expect(bg.state.windowsCreated[2]).toMatchObject({ type: "normal", focused: true });
		expect(bg.state.session["popout.windowId"]).toBe(999);
	});

	it("reports a failure when no window type can be created", async () => {
		const bg = await loadBackground();
		bg.chrome.windows.create = vi.fn(async (opts: Record<string, unknown>) => {
			bg.state.windowsCreated.push(opts);
			throw new Error("Window creation failed");
		});

		const { resp } = await bg.send(
			{ type: "POPOUT_OPEN", payload: {} },
			pageSender("example.com", 4),
		);

		expect(resp).toEqual({ ok: false, error: "Unable to open a separate window." });
		expect(bg.state.windowsCreated).toHaveLength(3);
		expect(bg.state.session["popout.windowId"]).toBeUndefined();
	});
});
