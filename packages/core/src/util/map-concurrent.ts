/** Ordered, bounded work. Stops scheduling new items after any worker fails. */
export async function mapConcurrent<T, U>(
	items: readonly T[],
	concurrency: number,
	task: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
	if (
		!(
			concurrency === Number.POSITIVE_INFINITY ||
			(Number.isInteger(concurrency) && concurrency > 0)
		)
	)
		throw new Error("Invalid concurrency");
	const output = new Array<U>(items.length);
	let next = 0;
	let failed = false;
	async function worker() {
		while (!failed && next < items.length) {
			const index = next++;
			try {
				output[index] = await task(items[index]!, index);
			} catch (error) {
				failed = true;
				throw error;
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, worker));
	return output;
}
