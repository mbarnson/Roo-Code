/**
 * Error class hierarchy for Claude Code provider
 *
 * This module provides structured error types for the Claude Code provider,
 * enabling consistent error handling, classification, and user feedback.
 */

/**
 * Base error class for all Claude Code provider errors
 */
export class ClaudeCodeError extends Error {
	constructor(
		message: string,
		public override cause?: Error,
	) {
		super(message)
		this.name = "ClaudeCodeError"

		// Maintain proper prototype chain
		Object.setPrototypeOf(this, ClaudeCodeError.prototype)

		// Capture stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor)
		}
	}
}

/**
 * Error thrown when Claude Code CLI authentication fails
 */
export class ClaudeCodeAuthError extends ClaudeCodeError {
	constructor(message: string, cause?: Error) {
		super(message, cause)
		this.name = "ClaudeCodeAuthError"
		Object.setPrototypeOf(this, ClaudeCodeAuthError.prototype)
	}
}

/**
 * Error thrown when Claude Code CLI execution fails
 */
export class ClaudeCodeCliError extends ClaudeCodeError {
	constructor(
		message: string,
		public exitCode?: number,
		cause?: Error,
	) {
		super(message, cause)
		this.name = "ClaudeCodeCliError"
		Object.setPrototypeOf(this, ClaudeCodeCliError.prototype)
	}
}

/**
 * Error thrown when Claude Code API request fails
 */
export class ClaudeCodeRequestError extends ClaudeCodeError {
	constructor(
		message: string,
		public statusCode?: number,
		cause?: Error,
	) {
		super(message, cause)
		this.name = "ClaudeCodeRequestError"
		Object.setPrototypeOf(this, ClaudeCodeRequestError.prototype)
	}
}

/**
 * Error thrown when parsing Claude Code API response fails
 */
export class ClaudeCodeParsingError extends ClaudeCodeError {
	constructor(
		message: string,
		public responseData?: string,
		cause?: Error,
	) {
		super(message, cause)
		this.name = "ClaudeCodeParsingError"
		Object.setPrototypeOf(this, ClaudeCodeParsingError.prototype)
	}
}

/**
 * Error thrown when Claude Code file operations fail
 */
export class ClaudeCodeFileOperationError extends ClaudeCodeError {
	constructor(
		message: string,
		public filePath: string,
		public operation: string,
		cause?: Error,
	) {
		super(message, cause)
		this.name = "ClaudeCodeFileOperationError"
		Object.setPrototypeOf(this, ClaudeCodeFileOperationError.prototype)
	}
}

/**
 * Error thrown when token limits are exceeded
 */
export class ClaudeCodeTokenLimitError extends ClaudeCodeError {
	constructor(
		message: string,
		public tokenCount?: number,
		public tokenLimit?: number,
		cause?: Error,
	) {
		super(message, cause)
		this.name = "ClaudeCodeTokenLimitError"
		Object.setPrototypeOf(this, ClaudeCodeTokenLimitError.prototype)
	}
}

/**
 * Error thrown when rate limits are exceeded
 */
export class ClaudeCodeRateLimitError extends ClaudeCodeError {
	constructor(
		message: string,
		public retryAfterSeconds?: number,
		cause?: Error,
	) {
		super(message, cause)
		this.name = "ClaudeCodeRateLimitError"
		Object.setPrototypeOf(this, ClaudeCodeRateLimitError.prototype)
	}
}

/**
 * Error thrown when operations time out
 */
export class ClaudeCodeTimeoutError extends ClaudeCodeError {
	constructor(
		message: string,
		public timeoutMs?: number,
		cause?: Error,
	) {
		super(message, cause)
		this.name = "ClaudeCodeTimeoutError"
		Object.setPrototypeOf(this, ClaudeCodeTimeoutError.prototype)
	}
}

/**
 * Error thrown when VS Code integration fails
 */
export class ClaudeCodeVsCodeError extends ClaudeCodeError {
	constructor(
		message: string,
		public vscodeOperation?: string,
		cause?: Error,
	) {
		super(message, cause)
		this.name = "ClaudeCodeVsCodeError"
		Object.setPrototypeOf(this, ClaudeCodeVsCodeError.prototype)
	}
}

/**
 * Utility function to classify errors based on their properties
 *
 * @param error - The error to classify
 * @param stderr - Standard error output from the command
 * @param exitCode - Exit code from the command
 * @returns A classified error with the appropriate type
 */
export function classifyCliError(error: Error, stderr: string, exitCode: number): ClaudeCodeError {
	// Check for authentication errors
	if (stderr.includes("not authenticated") || stderr.includes("auth") || stderr.includes("login")) {
		return new ClaudeCodeAuthError("Claude Code CLI is not authenticated", error)
	}

	// Check for rate limit errors
	if (stderr.includes("rate limit") || stderr.includes("too many requests") || stderr.includes("429")) {
		return new ClaudeCodeRateLimitError("Rate limit exceeded", undefined, error)
	}

	// Check for timeout errors
	if (exitCode === 124 || exitCode === 137 || stderr.includes("timed out") || stderr.includes("timeout")) {
		return new ClaudeCodeTimeoutError("Operation timed out", undefined, error)
	}

	// Check for token limit errors
	if (stderr.includes("token limit") || stderr.includes("too long") || stderr.includes("context limit")) {
		return new ClaudeCodeTokenLimitError("Token limit exceeded", undefined, undefined, error)
	}

	// Default to CLI error
	return new ClaudeCodeCliError(`Claude Code CLI exited with code ${exitCode}`, exitCode, error)
}

/**
 * Generate user-friendly error messages for each error type
 *
 * @param error - The error to get a message for
 * @returns A user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: Error): string {
	if (error instanceof ClaudeCodeAuthError) {
		return "Claude Code needs authentication. Run `claude-code login` in your terminal."
	}

	if (error instanceof ClaudeCodeRateLimitError) {
		const retryMessage = error.retryAfterSeconds
			? ` Please try again in ${error.retryAfterSeconds} seconds.`
			: " Please try again in a few minutes."
		return "Rate limit exceeded." + retryMessage
	}

	if (error instanceof ClaudeCodeTimeoutError) {
		return "The operation timed out. This might be due to network issues or high server load."
	}

	if (error instanceof ClaudeCodeTokenLimitError) {
		return "The input exceeded the token limit. Try reducing the length of your prompt."
	}

	if (error instanceof ClaudeCodeFileOperationError) {
		return `File operation '${error.operation}' failed for '${error.filePath}': ${error.message}`
	}

	if (error instanceof ClaudeCodeParsingError) {
		return "Failed to parse response from Claude Code CLI."
	}

	if (error instanceof ClaudeCodeVsCodeError) {
		return `VS Code integration error${error.vscodeOperation ? ` during ${error.vscodeOperation}` : ""}: ${error.message}`
	}

	// Generic message for other error types
	return `Claude Code error: ${error.message}`
}
