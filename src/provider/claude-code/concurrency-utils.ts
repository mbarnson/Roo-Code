/**
 * Concurrency utilities for Claude Code provider
 *
 * This module provides concurrency control mechanisms for
 * Claude Code CLI invocations, preventing conflicts when
 * multiple CLI commands are executed simultaneously.
 */

/**
 * A simple async semaphore for limiting concurrency
 */
export class Semaphore {
	private permits: number
	private waiting: Array<() => void> = []

	/**
	 * Create a new semaphore
	 *
	 * @param permits - Maximum number of concurrent operations
	 */
	constructor(permits: number) {
		this.permits = permits
	}

	/**
	 * Acquire a permit from the semaphore
	 *
	 * @returns Promise that resolves when a permit is acquired
	 */
	async acquire(): Promise<void> {
		if (this.permits > 0) {
			this.permits--
			return Promise.resolve()
		}

		return new Promise<void>((resolve) => {
			this.waiting.push(resolve)
		})
	}

	/**
	 * Release a permit back to the semaphore
	 */
	release(): void {
		if (this.waiting.length > 0) {
			// Wake up a waiting acquirer
			const resolve = this.waiting.shift()!
			resolve()
		} else {
			this.permits++
		}
	}

	/**
	 * Check if the semaphore has any available permits
	 *
	 * @returns True if permits are available
	 */
	get available(): boolean {
		return this.permits > 0
	}

	/**
	 * Get the number of tasks waiting for permits
	 *
	 * @returns Number of waiting tasks
	 */
	get waitingCount(): number {
		return this.waiting.length
	}
}

/**
 * Execute a function with semaphore-based concurrency control
 *
 * @param fn - Function to execute
 * @param semaphore - Semaphore to use for concurrency control
 * @returns Promise resolving to the function result
 */
export async function withConcurrencyLimit<T>(fn: () => Promise<T>, semaphore: Semaphore): Promise<T> {
	try {
		await semaphore.acquire()
		return await fn()
	} finally {
		semaphore.release()
	}
}

/**
 * A global semaphore instance for Claude Code CLI operations
 * Limits to 3 concurrent operations by default
 */
const CLAUDE_CODE_SEMAPHORE = new Semaphore(3)

/**
 * Execute a Claude Code CLI operation with concurrency control
 *
 * @param operation - Operation to execute
 * @returns Promise resolving to the operation result
 */
export async function executeWithConcurrencyControl<T>(operation: () => Promise<T>): Promise<T> {
	return withConcurrencyLimit(operation, CLAUDE_CODE_SEMAPHORE)
}

/**
 * A queue for processing operations in sequence
 */
export class OperationQueue {
	private queue: Array<() => Promise<any>> = []
	private isProcessing = false

	/**
	 * Enqueue an operation for execution
	 *
	 * @param operation - Operation to execute
	 * @returns Promise resolving to the operation result
	 */
	async enqueue<T>(operation: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push(async () => {
				try {
					const result = await operation()
					resolve(result)
					return result
				} catch (error) {
					reject(error)
					throw error
				}
			})

			this.processQueue()
		})
	}

	/**
	 * Process the next operation in the queue
	 */
	private async processQueue(): Promise<void> {
		if (this.isProcessing || this.queue.length === 0) {
			return
		}

		this.isProcessing = true

		try {
			const nextOperation = this.queue.shift()!
			await nextOperation()
		} finally {
			this.isProcessing = false
			this.processQueue()
		}
	}

	/**
	 * Get the number of operations in the queue
	 *
	 * @returns Number of queued operations
	 */
	get length(): number {
		return this.queue.length
	}

	/**
	 * Check if the queue is currently processing
	 *
	 * @returns True if the queue is processing
	 */
	get processing(): boolean {
		return this.isProcessing
	}
}

/**
 * A global queue for Claude Code file operations
 */
export const CLAUDE_CODE_FILE_OPERATION_QUEUE = new OperationQueue()

/**
 * Execute a file operation in sequence
 *
 * @param operation - File operation to execute
 * @returns Promise resolving to the operation result
 */
export async function executeFileOperationInSequence<T>(operation: () => Promise<T>): Promise<T> {
	return CLAUDE_CODE_FILE_OPERATION_QUEUE.enqueue(operation)
}
