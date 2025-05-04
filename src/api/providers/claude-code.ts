import { Anthropic } from "@anthropic-ai/sdk"
import { spawn } from "child_process"

import { ModelInfo } from "../../shared/api"
import { ApiHandler, SingleCompletionHandler } from "../index"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import { XmlMatcher } from "../../utils/xml-matcher"
import {
	ClaudeCodeAuthStatus,
	ClaudeCodeCommandOptions,
	ClaudeCodeModelsMap,
	ClaudeCodeChatInput,
} from "./models/claude-code-models"
import { CLAUDE_MODELS, CLAUDE_FALLBACK_MODEL, getDefaultClaudeModelId } from "./models/claude-models"

// Custom interface definition for image blocks since @anthropic-ai/sdk does not export this directly
// Using _prefix to avoid unused variable warnings as this is referenced indirectly
interface _ImageBlock {
	type: "image"
	source: {
		type: string
		media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
		data: string
	}
}

/**
 * Testing interface for ClaudeCodeHandler
 *
 * Exposes private methods for testing purposes in a controlled way.
 * This interface should only be used in tests.
 */
export interface ClaudeCodeTestingInterface {
	isAuthenticated: boolean
	authChecked: boolean
	authError: string | null
	waitForAuthentication(canYield?: boolean): Promise<[boolean, string | null]>
	validateCliPath(path?: string): string
	executeClaudeCodeCommand(command: string[], input?: string, timeout?: number): Promise<AsyncIterable<string>>
}

/**
 * Claude Code provider that uses the Claude Code CLI to interact with Claude
 */
export class ClaudeCodeHandler extends BaseProvider implements ApiHandler, SingleCompletionHandler {
	/**
	 * Check if the user is authenticated with the Claude Code CLI
	 *
	 * This static method executes the Claude Code CLI auth status command and parses
	 * the result to determine if the user is authenticated. It handles command execution,
	 * output parsing, and error handling.
	 *
	 * @param claudeCodePath - Path to the Claude Code CLI executable (defaults to "claude")
	 * @returns Promise resolving to true if authenticated, false otherwise
	 *
	 * @example
	 * ```typescript
	 * // Check authentication with default CLI path
	 * const isAuthenticated = await ClaudeCodeHandler.checkAuthentication();
	 *
	 * // Check authentication with custom CLI path
	 * const isAuthenticated = await ClaudeCodeHandler.checkAuthentication("/usr/local/bin/claude");
	 *
	 * if (!isAuthenticated) {
	 *   console.log("Please run 'claude login' to authenticate");
	 * }
	 * ```
	 */
	public static async checkAuthentication(claudeCodePath: string = "claude"): Promise<boolean> {
		try {
			// Run the auth status command
			const childProcess = spawn(claudeCodePath, ["auth", "status", "--json"], {
				shell: true,
				env: {
					...process.env,
					NODE_NO_WARNINGS: "1", // Suppress warnings
				},
			})

			let output = ""
			for await (const chunk of childProcess.stdout) {
				output += chunk.toString()
			}

			const errorOutput: string[] = []
			childProcess.stderr.on("data", (data) => {
				errorOutput.push(data.toString())
			})

			const exitCode = await new Promise<number>((resolve) => {
				childProcess.on("close", (code) => resolve(code || 0))
			})

			if (exitCode !== 0) {
				console.error(`Claude Code auth status command failed with code ${exitCode}`)
				console.error(`Error output: ${errorOutput.join("")}`)
				return false
			}

			if (!output) {
				return false
			}

			try {
				const status = JSON.parse(output) as unknown
				// Add type guard to verify object structure
				if (status && typeof status === "object" && "authenticated" in status) {
					const authStatus = status as ClaudeCodeAuthStatus
					return authStatus.authenticated === true
				}
				return false
			} catch (error) {
				console.error("Failed to parse Claude Code auth status output:", error)
				return false
			}
		} catch (error) {
			console.error("Error checking Claude Code authentication:", error)
			return false
		}
	}

	/**
	 * Reference to the centralized Claude model definitions
	 * @see ./models/claude-models.ts for the source of truth
	 */
	static readonly defaultModels: ClaudeCodeModelsMap = CLAUDE_MODELS

	protected options: ClaudeCodeCommandOptions

	private isAuthenticated: boolean = false
	private authChecked: boolean = false
	private authError: string | null = null

	constructor(options: ClaudeCodeCommandOptions) {
		super()
		this.options = options

		// Check authentication in the background
		this.checkAuthentication()
	}

	/**
	 * Validate and normalize a path to the Claude Code CLI
	 * @param path Path to validate
	 * @returns Normalized path or "claude" if using default
	 */
	private validateCliPath(path?: string): string {
		// Import the validateCliPath function from path-utils at run time to avoid circular dependencies
		try {
			// Use dynamic import to avoid circular dependencies
			const pathUtils = require("../../provider/claude-code/path-utils")
			return pathUtils.validateCliPath(path)
		} catch (error) {
			// Fall back to built-in validation if path-utils is not available

			if (!path) {
				return "claude" // Default executable name
			}

			// Trim whitespace
			const trimmedPath = path.trim()

			// If empty after trimming, use default
			if (!trimmedPath) {
				return "claude"
			}

			// Enhanced security validation for CLI path

			// 1. Check for shell metacharacters and other dangerous patterns
			const dangerousPatterns = [
				/[;&|<>$`\\"\s]/, // Basic shell metacharacters
				/\(\)/, // Command substitution
				/\{\}/, // Brace expansion
				/\[\]/, // Globbing
				/\*\?/, // Wildcard characters
				/\.\./, // Path traversal
				/~/, // Home directory expansion
				/env/, // Environment variables
				/sudo/, // Privilege escalation
				/\/bin\//, // Direct path to system binaries
				/\/etc\//, // System configuration files
			]

			// Check each pattern and reject if any match
			for (const pattern of dangerousPatterns) {
				if (pattern.test(trimmedPath)) {
					console.warn(`Potentially unsafe characters in CLI path: "${trimmedPath}". Using default instead.`)
					return "claude"
				}
			}

			// 2. Only allow alphanumeric characters, dashes, underscores, forward slashes, and dots
			// This is a whitelist approach that only permits safe characters
			const safePathPattern = /^[a-zA-Z0-9_\-\/\.]+$/
			if (!safePathPattern.test(trimmedPath)) {
				console.warn(`CLI path contains invalid characters: "${trimmedPath}". Using default instead.`)
				return "claude"
			}

			// 3. Maximum reasonable path length - prevent buffer overflow attacks
			if (trimmedPath.length > 1024) {
				console.warn(`CLI path too long (${trimmedPath.length} chars). Using default instead.`)
				return "claude"
			}

			// 4. Handle Windows .exe extension if needed
			if (
				process.platform === "win32" &&
				!trimmedPath.endsWith(".exe") &&
				!trimmedPath.includes("\\") &&
				!trimmedPath.includes("/")
			) {
				// For Windows, add .exe extension to command names without path separators
				return `${trimmedPath}.exe`
			}

			return trimmedPath
		}
	}

	/**
	 * Retry a function with exponential backoff
	 * @param fn Function to retry
	 * @param maxRetries Maximum number of retries
	 * @param initialDelayMs Initial delay in milliseconds
	 * @param maxDelayMs Maximum delay in milliseconds
	 * @param retryableErrors Array of error substrings that are retryable
	 * @returns Result of the function or throws an error if all retries fail
	 */
	private async retryWithBackoff<T>(
		fn: () => Promise<T>,
		maxRetries = 3,
		initialDelayMs = 100,
		maxDelayMs = 3000,
		retryableErrors: string[] = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "timeout"],
	): Promise<T> {
		let lastError: Error | null = null
		let delay = initialDelayMs

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await fn()
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))

				// Check if error is retryable
				const isRetryable = retryableErrors.some((errStr) => lastError && lastError.message.includes(errStr))

				if (!isRetryable || attempt === maxRetries) {
					throw lastError
				}

				console.info(
					`Retrying Claude Code CLI operation after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
				)

				// Wait before next retry
				await new Promise((resolve) => setTimeout(resolve, delay))

				// Exponential backoff with jitter
				delay = Math.min(delay * 2 * (0.9 + Math.random() * 0.2), maxDelayMs)
			}
		}

		// This should never happen because of the throw in the loop, but TypeScript needs it
		throw lastError || new Error("Max retries exceeded")
	}

	/**
	 * Check if the user is authenticated with Claude Code CLI
	 */
	private async checkAuthentication(): Promise<void> {
		try {
			const claudeCodePath = this.validateCliPath(this.options.claudeCodePath)

			// First check if the CLI is installed by trying to run the version command
			const isCliInstalled = await this.isClaudeCodeInstalled(claudeCodePath)

			if (!isCliInstalled) {
				this.updateAuthStatus(false, "Claude Code CLI not found. Please install it from https://claude.ai/code")
				return
			}

			try {
				this.isAuthenticated = await this.retryWithBackoff(
					() => ClaudeCodeHandler.checkAuthentication(claudeCodePath),
					2, // max retries
					100, // initial delay
					1000, // max delay
				)

				this.authError = this.isAuthenticated
					? null
					: "Not authenticated with Claude Code CLI. Please run 'claude login' in your terminal"
				this.authChecked = true
			} catch (error) {
				console.error("Failed to check Claude Code authentication after retries:", error)
				this.updateAuthStatus(false, "Failed to verify authentication status")
			}
		} catch (error) {
			console.error("Error checking Claude Code authentication:", error)
			this.updateAuthStatus(false, "Error checking authentication status")
		}
	}

	/**
	 * Update authentication status with a single method
	 */
	private updateAuthStatus(isAuthenticated: boolean, errorMessage: string | null): void {
		this.isAuthenticated = isAuthenticated
		this.authError = errorMessage
		this.authChecked = true
	}

	/**
	 * Check if Claude Code CLI is installed
	 */
	private async isClaudeCodeInstalled(claudeCodePath: string): Promise<boolean> {
		try {
			const childProcess = spawn(claudeCodePath, ["--version"], {
				shell: true,
			})

			const exitCode = await new Promise<number>((resolve) => {
				childProcess.on("close", (code) => resolve(code || 0))
			})

			return exitCode === 0
		} catch (error) {
			console.error("Error checking Claude Code installation:", error)
			return false
		}
	}

	/**
	 * Execute a Claude Code CLI command and return the result as a stream
	 * @param command - Command arguments to pass to the Claude Code CLI
	 * @param input - Optional input to send to the process stdin
	 * @param timeout - Optional timeout in milliseconds (overrides settings.commandTimeout, defaults to 60 seconds)
	 */
	private async executeClaudeCodeCommand(
		command: string[],
		input?: string,
		timeout?: number,
	): Promise<AsyncIterable<string>> {
		// Use provided timeout, option from settings, or default to 60000ms
		const commandTimeout = timeout || this.options.commandTimeout || 60000
		// Import concurrency utilities dynamically to avoid circular dependencies
		const { executeWithConcurrencyControl } = require("../../provider/claude-code/concurrency-utils")

		// Use concurrency control to limit simultaneous CLI invocations
		return executeWithConcurrencyControl(async () => {
			const claudeCodePath = this.validateCliPath(this.options.claudeCodePath)
			let stderrOutput = ""

			// Set up process
			const childProcess = spawn(claudeCodePath, command, {
				shell: true,
				env: {
					...process.env,
					NODE_NO_WARNINGS: "1",
				},
			})

			// Create a promise to handle process completion
			const processPromise = new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => {
					childProcess.kill()
					reject(new Error(`Claude Code CLI command timed out after ${commandTimeout}ms`))
				}, commandTimeout)

				// Handle errors
				childProcess.on("error", (err) => {
					clearTimeout(timer)

					if (err.message.includes("ENOENT")) {
						reject(new Error(`Claude Code CLI not found. Please install it or check settings.`))
					} else if (err.message.includes("EACCES")) {
						reject(new Error(`Permission denied when executing Claude Code CLI.`))
					} else {
						reject(new Error(`Failed to start Claude Code CLI: ${err.message}`))
					}
				})

				// Collect stderr output
				childProcess.stderr.on("data", (data) => {
					const stderr = data.toString()
					stderrOutput += stderr

					// Check for auth issues
					if (stderr.includes("not authenticated") || stderr.includes("auth")) {
						this.updateAuthStatus(false, "Not authenticated with Claude Code CLI")
					}
				})

				// Handle process completion
				childProcess.on("close", (code) => {
					clearTimeout(timer)

					if (code !== 0) {
						console.error(`Claude Code CLI exited with code ${code}: ${stderrOutput}`)
					}

					resolve()
				})
			})

			// Handle input if provided
			if (input) {
				childProcess.stdin.write(input)
				childProcess.stdin.end()
			}

			// Create stream for output
			const outputStream = (async function* () {
				try {
					for await (const chunk of childProcess.stdout) {
						yield chunk.toString()
					}
				} catch (error) {
					console.error("Error reading Claude Code CLI output:", error)
					throw error
				}
			})()

			// Start the process promise (don't await it)
			processPromise.catch((error) => console.error("Claude Code process error:", error))

			return outputStream
		})
	}

	/**
	 * Wait for authentication check to complete
	 * @param _canYield - Whether to yield status messages (for streaming APIs)
	 * @returns A tuple with [isAuthenticated, errorMessage]
	 * @remarks
	 * Uses options.authCheckTimeout (default: 5000ms) as timeout for authentication check
	 */
	private async waitForAuthentication(_canYield = false): Promise<[boolean, string | null]> {
		// Wait for authentication check to complete if not done yet
		if (!this.authChecked) {
			// Note: Yielding is handled by the caller in generator functions
			// _canYield parameter is passed to match the expected API but not used within this method

			await new Promise<void>((resolve) => {
				const checkInterval = setInterval(() => {
					if (this.authChecked) {
						clearInterval(checkInterval)
						resolve()
					}
				}, 100)

				// Set a timeout to avoid waiting forever - use configured timeout or default
				setTimeout(() => {
					clearInterval(checkInterval)
					this.authError = "Authentication check timed out"
					this.authChecked = true
					this.isAuthenticated = false
					resolve()
				}, this.options.authCheckTimeout || 5000)
			})
		}

		return [this.isAuthenticated, this.authError]
	}

	/**
	 * Create a message using the Claude Code CLI
	 *
	 * This method sends a conversation to Claude through the CLI and returns a stream
	 * of responses. It handles authentication, command execution, and error formatting.
	 *
	 * The method automatically applies configured options such as model selection,
	 * temperature, max tokens, and thinking budget when available.
	 *
	 * @param systemPrompt - System prompt to provide context for Claude
	 * @param messages - Array of message objects to send to Claude (user/assistant pairs)
	 * @returns An async generator yielding stream chunks with type and text properties
	 *
	 * @throws Will not throw directly but yields error messages in the stream
	 *
	 * @example
	 * ```typescript
	 * const stream = provider.createMessage(
	 *   "You are a helpful assistant that explains code.",
	 *   [{ role: "user", content: "Explain how promises work in JavaScript" }]
	 * );
	 *
	 * for await (const chunk of stream) {
	 *   if (chunk.type === "text") {
	 *     console.log(chunk.text);
	 *   } else if (chunk.type === "reasoning") {
	 *     console.log("Thinking:", chunk.text);
	 *   }
	 * }
	 * ```
	 */
	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		try {
			// Wait for authentication check to complete
			const [isAuthenticated, authError] = await this.waitForAuthentication(true)

			// If in yielding mode, provide status
			yield { type: "text", text: "Checking Claude Code CLI authentication status..." }

			// Check if authenticated
			if (!isAuthenticated) {
				const errorMessage = authError || "Not authenticated with Claude Code CLI"
				yield {
					type: "text",
					text: `${errorMessage}\n\nTo use Claude Code CLI as a provider:\n1. Install Claude Code CLI from https://claude.ai/code\n2. Run 'claude login' in your terminal\n3. Verify it works by running 'claude chat' in your terminal`,
				}
				return
			}

			const modelId = this.getModel().id

			// Prepare command arguments
			const args = ["--model", modelId]

			// Add temperature if specified
			if (this.options.modelTemperature !== undefined) {
				args.push("--temperature", this.options.modelTemperature.toString())
			}

			// Add max tokens if specified
			if (this.options.includeMaxTokens && this.options.modelMaxTokens) {
				args.push("--max-tokens", this.options.modelMaxTokens.toString())
			}

			// Add thinking budget if applicable
			if (modelId.includes("3-7") && this.options.modelMaxThinkingTokens) {
				args.push("--thinking-budget", this.options.modelMaxThinkingTokens.toString())
			}

			// Process message content with appropriate type handling
			const processedMessages = messages.map((msg) => {
				let processedContent: string

				if (typeof msg.content === "string") {
					processedContent = msg.content
				} else if (Array.isArray(msg.content)) {
					// Process array of content blocks
					processedContent = msg.content
						.filter((item) => item.type === "text")
						.map((item) => {
							// Ensure we're only accessing text fields on text items
							if (item.type === "text" && "text" in item) {
								return item.text
							}
							return ""
						})
						.join("\n")
				} else {
					// Handle unexpected content type
					processedContent = ""
				}

				return {
					role: msg.role,
					content: processedContent,
				}
			})

			// Create a correctly typed input object for Claude Code CLI
			const inputJson: ClaudeCodeChatInput = {
				system: systemPrompt,
				messages: processedMessages,
			}

			// Use stdin to pass the input
			const inputStr = JSON.stringify(inputJson)

			// Execute Claude Code CLI command with retries for transient errors
			let stream: AsyncIterable<string>
			try {
				stream = await this.retryWithBackoff(
					() => this.executeClaudeCodeCommand(["chat", ...args], inputStr),
					2, // max retries
					500, // initial delay
					2000, // max delay
				)
			} catch (error) {
				console.error("Failed to execute Claude Code CLI command after retries:", error)
				yield {
					type: "text",
					text: `Error connecting to Claude Code CLI: ${error instanceof Error ? error.message : String(error)}`,
				}
				return
			}

			// Use XML matcher to process the output, looking for <thinking> tags
			const matcher = new XmlMatcher(
				"thinking",
				(chunk) =>
					({
						type: chunk.matched ? "reasoning" : "text",
						text: chunk.data,
					}) as const,
			)

			// Process stream
			for await (const chunk of stream) {
				// Process each chunk through the matcher
				for (const processed of matcher.update(chunk)) {
					yield processed
				}
			}

			// Process any final content
			for (const chunk of matcher.final()) {
				yield chunk
			}
		} catch (error) {
			console.error("Error in Claude Code createMessage:", error)
			if (error instanceof Error) {
				yield { type: "text", text: `Error connecting to Claude Code CLI: ${error.message}` }
			} else {
				yield { type: "text", text: "Unknown error connecting to Claude Code CLI" }
			}
		}
	}

	/**
	 * Get the model info for the current model
	 *
	 * This method returns information about the currently selected Claude model,
	 * using the centralized model definitions from claude-models.ts. It retrieves
	 * the model ID from the provider options or falls back to the default model.
	 *
	 * The returned model information includes properties like context window size,
	 * maximum tokens, pricing, and other capabilities specific to each Claude model.
	 *
	 * @returns An object containing the model ID and model information
	 *
	 * @example
	 * ```typescript
	 * const { id, info } = provider.getModel();
	 * console.log(`Using model: ${id}`);
	 * console.log(`Context window: ${info.contextWindow} tokens`);
	 * console.log(`Maximum output: ${info.maxTokens} tokens`);
	 * ```
	 */
	override getModel(): { id: string; info: ModelInfo } {
		// Use configured model ID or default
		const modelId = this.options.claudeCodeModelId || getDefaultClaudeModelId()

		// Get model info from centralized definitions, or use fallback
		const modelInfo = CLAUDE_MODELS[modelId] || CLAUDE_FALLBACK_MODEL

		return {
			id: modelId,
			info: modelInfo,
		}
	}

	/**
	 * Implementation of a single prompt completion
	 *
	 * This method sends a single prompt to Claude through the CLI and returns
	 * the complete response as a string. It's used for shorter, non-streaming
	 * completions such as code snippets or quick answers.
	 *
	 * The method applies configured options such as model selection, temperature,
	 * and max tokens when available. It handles authentication and error formatting.
	 *
	 * @param prompt - The text prompt to send to Claude for completion
	 * @returns A promise that resolves to the completed text response
	 *
	 * @throws Error if authentication fails or the CLI encounters an error
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   const completion = await provider.completePrompt(
	 *     "Write a function that calculates the factorial of a number in JavaScript"
	 *   );
	 *   console.log(completion);
	 * } catch (error) {
	 *   console.error("Completion failed:", error);
	 * }
	 * ```
	 */
	async completePrompt(prompt: string): Promise<string> {
		try {
			// Wait for authentication check to complete
			const [isAuthenticated, authError] = await this.waitForAuthentication(false)

			// Check if authenticated
			if (!isAuthenticated) {
				const errorMessage = authError || "Not authenticated with Claude Code CLI"
				throw new Error(`${errorMessage}. Please run 'claude login' in your terminal.`)
			}

			const modelId = this.getModel().id

			// Prepare command arguments
			const args = ["--model", modelId, "--no-color"]

			// Add temperature if specified
			if (this.options.modelTemperature !== undefined) {
				args.push("--temperature", this.options.modelTemperature.toString())
			}

			// Add max tokens if specified
			if (this.options.includeMaxTokens && this.options.modelMaxTokens) {
				args.push("--max-tokens", this.options.modelMaxTokens.toString())
			}

			// Execute command with retries for transient errors
			let stream: AsyncIterable<string>
			try {
				stream = await this.retryWithBackoff(
					() => this.executeClaudeCodeCommand(["complete", ...args], prompt),
					2, // max retries
					500, // initial delay
					2000, // max delay
				)
			} catch (error) {
				throw new Error(
					`Claude Code completion error: ${error instanceof Error ? error.message : String(error)}`,
				)
			}

			let result = ""
			for await (const chunk of stream) {
				result += chunk
			}

			return result.trim()
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Claude Code completion error: ${error.message}`)
			}
			throw error
		}
	}

	/**
	 * Count tokens for the given content blocks
	 *
	 * This method provides an approximate estimation of token count since the
	 * Claude Code CLI doesn't expose direct token counting functionality. It uses
	 * a simple character-based heuristic, estimating about 4 characters per token
	 * for English text.
	 *
	 * The method handles different content types including plain text, text blocks,
	 * and image references. It performs type-safe operations to ensure accurate counting.
	 *
	 * @param content - Array of content blocks to count tokens for
	 * @returns Promise resolving to the approximate token count
	 *
	 * @remarks
	 * This is only an estimation and may not match Claude's exact token counting.
	 * For precise token counting, a specialized tokenizer implementation would be needed.
	 * Future improvements could include using a more accurate tokenization algorithm
	 * or integrating with Claude's token counting APIs when available.
	 *
	 * @example
	 * ```typescript
	 * const tokenCount = await provider.countTokens([
	 *   { type: "text", text: "This is a sample text to count" }
	 * ]);
	 * console.log(`Estimated tokens: ${tokenCount}`);
	 * ```
	 */
	override async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		// Handle empty content array
		if (!content || content.length === 0) {
			return 0
		}

		// Import tiktoken directly to avoid complexity
		let countTokensEstimate: ((text: string) => number) | null = null
		try {
			const tiktoken = require("../../utils/tiktoken")
			countTokensEstimate = tiktoken.countTokensEstimate
		} catch (error) {
			console.warn("Tiktoken not available, using character-based estimation")
		}

		let totalTokens = 0

		// Process each content block
		for (const block of content) {
			if (!block) continue

			try {
				// Handle string content
				if (typeof block === "string") {
					totalTokens += this.countBlockTokens(block, countTokensEstimate)
				}
				// Handle object content
				else if (typeof block === "object" && block !== null) {
					// Text blocks
					if (block.type === "text" && "text" in block) {
						totalTokens += this.countBlockTokens(block.text as string, countTokensEstimate)
					}
					// Image blocks
					else if (block.type === "image") {
						totalTokens += 85 // Standard estimate for image blocks
					}
					// Other blocks
					else {
						const blockText = JSON.stringify(block).replace(/"(type|role|source|name)":\s*"[^"]*"/g, "")
						totalTokens += this.countBlockTokens(blockText, countTokensEstimate)
					}
				}
			} catch (error) {
				console.warn("Error counting tokens for block:", error)
			}
		}

		return totalTokens
	}

	/**
	 * Count tokens for a text block using tiktoken if available
	 */
	private countBlockTokens(text: string, tokenCounter: ((text: string) => number) | null): number {
		if (!text) return 0

		const safeText = String(text || "")

		if (tokenCounter) {
			return tokenCounter(safeText)
		}

		// Rough estimation: ~4 characters per token for English text
		return Math.ceil(safeText.length / 4)
	}

	/**
	 * Expose internal methods for testing purposes
	 *
	 * This method provides controlled access to private methods for testing.
	 * It should only be used in test files.
	 *
	 * @returns Interface with access to internal methods
	 */
	static _exposeForTesting(instance: ClaudeCodeHandler): ClaudeCodeTestingInterface {
		return {
			get isAuthenticated() {
				return instance["isAuthenticated"]
			},
			set isAuthenticated(value: boolean) {
				instance["isAuthenticated"] = value
			},

			get authChecked() {
				return instance["authChecked"]
			},
			set authChecked(value: boolean) {
				instance["authChecked"] = value
			},

			get authError() {
				return instance["authError"]
			},
			set authError(value: string | null) {
				instance["authError"] = value
			},

			waitForAuthentication: instance["waitForAuthentication"].bind(instance),
			validateCliPath: instance["validateCliPath"].bind(instance),
			executeClaudeCodeCommand: instance["executeClaudeCodeCommand"].bind(instance),
		}
	}
}

/**
 * Get available Claude Code models by running the CLI
 *
 * This function retrieves the list of available Claude models by combining:
 * 1. The centralized model definitions from claude-models.ts
 * 2. Any additional models reported by the Claude Code CLI
 *
 * It handles authentication checks, command execution, output parsing, and error handling.
 * If the CLI is not installed or the user is not authenticated, it falls back to the
 * centralized model definitions.
 *
 * @param claudeCodePath - Path to the Claude Code CLI executable (defaults to "claude")
 * @returns Promise resolving to an array of model IDs supported by Claude Code
 *
 * @example
 * ```typescript
 * // Get models with default CLI path
 * const models = await getClaudeCodeModels();
 *
 * // Get models with custom CLI path
 * const models = await getClaudeCodeModels("/usr/local/bin/claude");
 *
 * // Use models to populate a dropdown
 * const dropdown = document.getElementById("model-select");
 * models.forEach(model => {
 *   const option = document.createElement("option");
 *   option.value = model;
 *   option.textContent = model;
 *   dropdown.appendChild(option);
 * });
 * ```
 */
export async function getClaudeCodeModels(claudeCodePath = "claude"): Promise<string[]> {
	try {
		// Get the default models from the centralized definitions
		const defaultModels = Object.keys(CLAUDE_MODELS)

		// Check if CLI is installed first
		try {
			const checkProcess = spawn(claudeCodePath, ["--version"], {
				shell: true,
			})

			const exitCode = await new Promise<number>((resolve) => {
				checkProcess.on("close", (code) => resolve(code !== null ? code : 0))
			})

			if (exitCode !== 0) {
				console.warn("Claude Code CLI not installed or not in PATH")
				return defaultModels
			}
		} catch (error) {
			console.warn("Failed to check Claude Code CLI installation:", error)
			return defaultModels
		}

		// Check if authenticated
		const isAuthenticated = await ClaudeCodeHandler.checkAuthentication(claudeCodePath)
		if (!isAuthenticated) {
			console.warn("Not authenticated with Claude Code CLI")
			return defaultModels
		}

		// Try to get additional models from the CLI
		const childProcess = spawn(claudeCodePath, ["models", "--output", "json"], {
			shell: true,
		})

		let output = ""

		for await (const chunk of childProcess.stdout) {
			output += chunk.toString()
		}

		const errorOutput: string[] = []
		childProcess.stderr.on("data", (data) => {
			errorOutput.push(data.toString())
		})

		const exitCode = await new Promise<number>((resolve) => {
			childProcess.on("close", (code) => resolve(code !== null ? code : 0))
		})

		if (exitCode !== 0) {
			console.warn(`Claude Code models command failed with code ${exitCode}`)
			console.warn(`Error output: ${errorOutput.join("")}`)
			return defaultModels
		}

		if (output && output.trim()) {
			try {
				// Parse with unknown type first, then validate
				const parsedOutput = JSON.parse(output) as unknown

				// Type guard to ensure it's an array
				if (Array.isArray(parsedOutput)) {
					// Combine CLI-reported models with default models, ensuring unique values
					const cliModels = parsedOutput.filter((item): item is string => typeof item === "string")
					return [...new Set([...cliModels, ...defaultModels])]
				} else {
					console.warn("Claude Code models output is not an array")
					return defaultModels
				}
			} catch (err) {
				console.warn("Failed to parse Claude Code models output:", err)
				return defaultModels
			}
		}

		return defaultModels
	} catch (error) {
		console.error("Failed to get Claude Code models:", error)
		return Object.keys(CLAUDE_MODELS)
	}
}
