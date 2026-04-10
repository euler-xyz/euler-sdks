export type BatchFn<K, V> = (keys: K[]) => Promise<V[]>;

export interface CallBundlerOptions {
	maxBatchSize?: number;
	debounceMs?: number;
	maxConcurrentBatches?: number;
}

interface QueueItem<K, V> {
	key: K;
	resolve: (value: V) => void;
	reject: (error: unknown) => void;
}

/**
 * Creates a load function that bundles individual calls within the same
 * debounce window into a single batch invocation.
 */
export function createCallBundler<K, V>(
	batchFn: BatchFn<K, V>,
	options?: CallBundlerOptions,
): (key: K) => Promise<V> {
	const bundler = new CallBundler(batchFn, options);
	return (key) => bundler.load(key);
}

/**
 * Wraps a batch function `(keys: K[]) => Promise<V>` into a function with the
 * same signature, where keys from concurrent calls within the same debounce
 * window are merged into a single batch invocation. All callers receive the same
 * result.
 */
export function createBundledCall<K, V>(
	batchFn: (keys: K[]) => Promise<V>,
	options?: CallBundlerOptions,
): (keys: K[]) => Promise<V> {
	const load = createCallBundler<K, V>(async (keys) => {
		const result = await batchFn(keys);
		return keys.map(() => result);
	}, options);

	return async (keys) => {
		if (!keys.length) return batchFn([]);
		const results = await Promise.all(keys.map(load));
		return results[0]!;
	};
}

export class CallBundler<K, V> {
	private batchFn: BatchFn<K, V>;
	private maxBatchSize: number;
	private debounceMs: number;
	private maxConcurrentBatches: number;
	private queue: QueueItem<K, V>[] = [];
	private scheduled = false;
	private activeBatchCount = 0;

	constructor(batchFn: BatchFn<K, V>, options?: CallBundlerOptions) {
		this.batchFn = batchFn;
		this.maxBatchSize = options?.maxBatchSize ?? Infinity;
		this.debounceMs = Math.max(0, options?.debounceMs ?? 5);
		this.maxConcurrentBatches = Math.max(
			1,
			options?.maxConcurrentBatches ?? 4,
		);
	}

	load(key: K): Promise<V> {
		return new Promise<V>((resolve, reject) => {
			this.queue.push({ key, resolve, reject });
			this.scheduleDispatch();
		});
	}

	private scheduleDispatch(): void {
		if (this.scheduled) return;
		this.scheduled = true;

		if (this.debounceMs === 0) {
			queueMicrotask(() => this.drainQueue());
			return;
		}

		setTimeout(() => this.drainQueue(), this.debounceMs);
	}

	private drainQueue(): void {
		this.scheduled = false;

		while (
			this.activeBatchCount < this.maxConcurrentBatches &&
			this.queue.length > 0
		) {
			const batch = this.queue.splice(0, this.maxBatchSize);
			if (batch.length === 0) break;
			this.dispatchBatch(batch);
		}

		if (this.queue.length > 0) {
			this.scheduleDispatch();
		}
	}

	private dispatchBatch(batch: QueueItem<K, V>[]): void {
		this.activeBatchCount += 1;
		const keys = batch.map((item) => item.key);

		this.batchFn(keys)
			.then((values) => {
				if (values.length !== keys.length) {
					const error = new Error(
						`CallBundler: batch function returned ${values.length} results for ${keys.length} keys`,
					);
					batch.forEach((item) => item.reject(error));
					return;
				}
				batch.forEach((item, i) => item.resolve(values[i]!));
			})
			.catch((error) => {
				batch.forEach((item) => item.reject(error));
			})
			.finally(() => {
				this.activeBatchCount -= 1;
				if (this.queue.length > 0) {
					this.scheduleDispatch();
				}
			});
	}
}
