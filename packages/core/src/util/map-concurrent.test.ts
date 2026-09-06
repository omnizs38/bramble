import { describe, expect, it } from "vitest";
import { mapConcurrent } from "./map-concurrent";

describe("bounded encryption work", () => {
	it("keeps order and limits pending jobs to eight", async () => {
		let running = 0,
			peak = 0;
		const items = Array.from({ length: 200 }, (_, i) => i);
		const result = await mapConcurrent(items, 8, async (i) => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, i % 3));
			running--;
			return i * 2;
		});
		expect(result).toEqual(items.map((i) => i * 2));
		expect(peak).toBe(8);
	});
	it("stops queueing new work after an error and never returns partial output", async () => {
		const started: number[] = [];
		await expect(
			mapConcurrent([0, 1, 2, 3, 4, 5], 2, async (i) => {
				started.push(i);
				if (i === 0) throw new Error("failed");
				await new Promise((resolve) => setTimeout(resolve, 5));
				return i;
			}),
		).rejects.toThrow("failed");
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(started).toEqual([0, 1]);
	});
	it("supports empty input and rejects invalid limits", async () => {
		expect(await mapConcurrent([], 8, async () => 1)).toEqual([]);
		for (const limit of [0, -1, 0.5, NaN])
			await expect(mapConcurrent([1], limit, async (x) => x)).rejects.toThrow();
	});
});
