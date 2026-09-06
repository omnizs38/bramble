import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncBridge } from "../offscreen-core";

const host = vi.hoisted(() => ({
	loads: 0,
	fail: false,
	setSyncBridge: vi.fn(),
	handleHostMessage: vi.fn(async () => ({ ok: true, data: "done" })),
}));
vi.mock("./vek-store", () => ({ vekMutationSnapshot: () => 0 }));

const bridge: SyncBridge = {
	fetchLocalPayload: async () => "payload",
	pushRemotePayload: async () => {},
	fetchLocalRoster: async () => "roster",
	pushRemoteRoster: async () => {},
};

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	host.loads = 0;
	host.fail = false;
	vi.doMock("../offscreen-core", () => {
		host.loads++;
		if (host.fail) throw new Error("host chunk failed to load");
		return { setSyncBridge: host.setSyncBridge, handleHostMessage: host.handleHostMessage };
	});

	vi.stubGlobal("chrome", { runtime: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("lazy in-process sync host", () => {
	it("registers the bridge before dispatch, without loading the host at registration", async () => {
		const client = await import("./offscreen-client");
		client.setInProcessSyncBridge(bridge);
		expect(host.loads).toBe(0);
		await expect(client.sendToOffscreen({ type: "SYNC_ROSTER_SYNC" })).resolves.toEqual({
			ok: true,
			data: "done",
		});
		expect(host.setSyncBridge).toHaveBeenCalledWith(bridge);
		expect(host.setSyncBridge.mock.invocationCallOrder[0]).toBeLessThan(
			host.handleHostMessage.mock.invocationCallOrder[0]!,
		);
	});
	it("propagates a chunk-load failure instead of running without a bridge", async () => {
		host.fail = true;
		const client = await import("./offscreen-client");
		client.setInProcessSyncBridge(bridge);
		await expect(client.sendToOffscreen({ type: "SYNC_ROSTER_SYNC" })).rejects.toThrow();
		expect(host.handleHostMessage).not.toHaveBeenCalled();
	});
	it("fails explicitly when the bridge has not been registered", async () => {
		const client = await import("./offscreen-client");
		await expect(client.sendToOffscreen({ type: "SYNC_ROSTER_SYNC" })).rejects.toThrow(
			"sync bridge not registered",
		);
		expect(host.handleHostMessage).not.toHaveBeenCalled();
	});
	it("uses messaging on Chromium without importing the in-process host", async () => {
		const sendMessage = vi.fn(async () => ({ ok: true }));
		vi.stubGlobal("chrome", {
			runtime: { sendMessage },
			offscreen: { hasDocument: async () => true },
		});
		const client = await import("./offscreen-client");
		client.setInProcessSyncBridge(bridge);
		await expect(client.sendToOffscreen({ type: "SYNC_ROSTER_SYNC" })).resolves.toEqual({
			ok: true,
		});
		expect(sendMessage).toHaveBeenCalledWith({ type: "SYNC_ROSTER_SYNC", target: "offscreen" });
		expect(host.loads).toBe(0);
	});
});

describe("Chromium offscreen creation readiness", () => {
	function deferred<T>() {
		let resolve!: (value: T) => void;
		let reject!: (error: Error) => void;
		const promise = new Promise<T>((yes, no) => {
			resolve = yes;
			reject = no;
		});
		return { promise, resolve, reject };
	}
	const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
	function mockChrome(hasDocument: () => Promise<boolean>, createDocument: () => Promise<void>) {
		const sendMessage = vi.fn(async () => ({ ok: true }));
		vi.stubGlobal("chrome", {
			runtime: { sendMessage },
			offscreen: {
				hasDocument,
				createDocument,
				Reason: { WORKERS: "WORKERS", CLIPBOARD: "CLIPBOARD", WEB_RTC: "WEB_RTC" },
			},
		});
		return sendMessage;
	}
	it("waits for createDocument even when the unfinished document already exists", async () => {
		const loading = deferred<void>();
		let exists = false;
		const createDocument = vi.fn(() => {
			exists = true;
			return loading.promise;
		});
		const sendMessage = mockChrome(async () => exists, createDocument);
		const client = await import("./offscreen-client");
		const first = client.ensureOffscreen();
		await flush();
		expect(createDocument).toHaveBeenCalledOnce();
		const second = client.sendToOffscreen({ type: "SYNC_ROSTER_SYNC" });
		await flush();
		expect(sendMessage).not.toHaveBeenCalled();
		loading.resolve();
		await first;
		await second;
		expect(createDocument).toHaveBeenCalledOnce();
		expect(sendMessage).toHaveBeenCalledOnce();
	});
	it("joins creation that began while its existence probe was pending", async () => {
		const probe = deferred<boolean>();
		const loading = deferred<void>();
		const hasDocument = vi.fn().mockReturnValueOnce(probe.promise).mockResolvedValue(false);
		const createDocument = vi.fn(() => loading.promise);
		const sendMessage = mockChrome(hasDocument, createDocument);
		const client = await import("./offscreen-client");
		const first = client.sendToOffscreen({ type: "SYNC_ROSTER_SYNC" });
		const second = client.ensureOffscreen();
		await flush();
		expect(createDocument).toHaveBeenCalledOnce();
		probe.resolve(true);
		await flush();
		expect(sendMessage).not.toHaveBeenCalled();
		loading.resolve();
		await Promise.all([first, second]);
		expect(sendMessage).toHaveBeenCalledOnce();
	});
	it("propagates a failed creation to waiting callers without sending their operation", async () => {
		const loading = deferred<void>();
		let exists = false;
		const createDocument = vi.fn(() => {
			exists = true;
			return loading.promise;
		});
		const sendMessage = mockChrome(async () => exists, createDocument);
		const client = await import("./offscreen-client");
		const first = client.ensureOffscreen();
		await flush();
		const second = client.sendToOffscreen({ type: "SYNC_ROSTER_SYNC" });
		const results = Promise.allSettled([first, second]);
		loading.reject(new Error("offscreen load failed"));
		expect((await results).map((r) => r.status)).toEqual(["rejected", "rejected"]);
		expect(sendMessage).not.toHaveBeenCalled();
	});
});
