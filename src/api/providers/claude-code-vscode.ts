import * as vscode from "vscode"
import * as path from "path"
import { ApiStream } from "../transform/stream"
import { ModelInfo } from "../../shared/api"
import { ApiHandler, SingleCompletionHandler } from "../index"
import { ClaudeCodeHandler } from "./claude-code"
import { Anthropic } from "@anthropic-ai/sdk"
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"
import { FileContextTracker } from "../../core/context-tracking/FileContextTracker"
import { FileDetector } from "./utils/file-detector"
import { t } from "../../i18n"
import {
	VsCodeIntegratedClaudeCodeOptions,
	FileModificationsMap,
	ErrorFormattingOperation,
	ProgressResolver,
	CreateVsCodeIntegratedClaudeCodeOptions,
} from "./models/claude-code-vscode-types"

/**
 * VS Code integrated wrapper for the Claude Code CLI provider
 * This class intercepts file operations and routes them through VS Code's editor APIs
 */
export class VsCodeIntegratedClaudeCode implements ApiHandler, SingleCompletionHandler {
	private cliHandler: ClaudeCodeHandler
	private diffViewProvider: DiffViewProvider | undefined
	private fileContextTracker: FileContextTracker | undefined
	private isExecutingCommand = false
	private vsCodeIntegrationEnabled: boolean
	private fileDetector: FileDetector

	/**
	 * Count tokens for content blocks by delegating to the underlying CLI handler
	 * @param content The content to count tokens for
	 * @returns Token count
	 */
	async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		return this.cliHandler.countTokens(content)
	}

	/**
	 * Creates a new VS Code integrated Claude Code handler
	 *
	 * @param options Configuration options for the Claude Code provider
	 * @param cwd Current working directory
	 */
	constructor(
		options: VsCodeIntegratedClaudeCodeOptions,
		private cwd: string = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
	) {
		this.cliHandler = new ClaudeCodeHandler({
			claudeCodePath: options.claudeCodePath,
			claudeCodeModelId: options.claudeCodeModelId,
			modelTemperature: options.modelTemperature,
			includeMaxTokens: options.includeMaxTokens,
			modelMaxTokens: options.modelMaxTokens,
			modelMaxThinkingTokens: options.modelMaxThinkingTokens,
			reasoningEffort: options.reasoningEffort,
		})

		// Default to enabled unless explicitly disabled
		this.vsCodeIntegrationEnabled = options.claudeCodeVsCodeIntegration !== false

		// Initialize file detector
		this.fileDetector = new FileDetector(cwd)
	}

	/**
	 * Initialize the wrapper with VS Code components
	 * @param diffViewProvider DiffViewProvider instance for handling file diffs
	 * @param fileContextTracker FileContextTracker instance for tracking file context
	 */
	public initialize(diffViewProvider: DiffViewProvider, fileContextTracker: FileContextTracker): void {
		this.diffViewProvider = diffViewProvider
		this.fileContextTracker = fileContextTracker
	}

	/**
	 * Standardized error handling for Claude Code operations
	 *
	 * @param error The error to handle
	 * @param operation Description of the operation that failed
	 * @returns A formatted error message for display
	 */
	private formatErrorMessage(error: unknown, operation: ErrorFormattingOperation): string {
		if (error === null || error === undefined) {
			return t("common:errors.claude_code.unknown", { operation })
		}

		if (error instanceof Error) {
			// Check for common error patterns
			const message = error.message

			if (message.includes("ENOENT")) {
				return t("common:errors.claude_code.not_found", { operation })
			}

			if (message.includes("EACCES") || message.includes("permission")) {
				return t("common:errors.claude_code.permission_denied", { operation })
			}

			if (message.includes("timeout") || message.includes("timed out")) {
				return t("common:errors.claude_code.timeout", { operation })
			}

			if (message.includes("not authenticated") || message.includes("auth")) {
				return t("common:errors.claude_code.auth_failed", { operation })
			}

			// Return the original message if no specific pattern is found
			return t("common:errors.claude_code.general", {
				operation,
				message,
			})
		}

		// For non-Error objects, convert to string
		return t("common:errors.claude_code.general", {
			operation,
			message: String(error),
		})
	}

	/**
	 * Create a message using the Claude Code CLI with VS Code integration
	 *
	 * @param systemPrompt The system prompt to send to Claude
	 * @param messages The messages to send to Claude
	 * @returns A stream of responses from Claude
	 */
	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		try {
			// Show progress in the UI
			this.showProgress("Generating response with Claude Code...")

			// Store original CLI output for tracking file modifications
			const fileModifications = new Map<string, string>()

			// Create wrapper for CLI stream that intercepts file mentions and operations
			const cliStream = this.cliHandler.createMessage(systemPrompt, messages)
			for await (const chunk of cliStream) {
				// Track file mentions in the chunk
				if (chunk.type === "text" && chunk.text) {
					this.trackFileMentions(chunk.text)

					// Intercept file paths that might be getting modified
					this.detectFileModifications(chunk.text, fileModifications)
				}

				yield chunk
			}

			// Handle any detected file modifications after response is complete
			await this.processDetectedFileModifications(fileModifications)
		} catch (error) {
			console.error("Error in VS Code integrated Claude Code createMessage:", error)
			yield {
				type: "text",
				text: this.formatErrorMessage(error, "message generation"),
			}
		} finally {
			// Clean up UI indicators
			this.hideProgress()
		}
	}

	/**
	 * Implementation of a single prompt completion with VS Code integration
	 *
	 * @param prompt The prompt to send to Claude
	 * @returns A string containing Claude's completion
	 * @throws Error if the completion operation fails
	 */
	async completePrompt(prompt: string): Promise<string> {
		try {
			// Show progress in the UI
			this.showProgress("Generating completion with Claude Code...")

			// Execute completion through CLI handler
			const completion = await this.cliHandler.completePrompt(prompt)

			// Track file mentions in the completion
			this.trackFileMentions(completion)

			return completion
		} catch (error) {
			console.error("Error in VS Code integrated Claude Code completePrompt:", error)
			// Convert error to a standardized format and rethrow
			throw new Error(this.formatErrorMessage(error, "completion"))
		} finally {
			// Clean up UI indicators
			this.hideProgress()
		}
	}

	/**
	 * Get the model info for the current model
	 */
	getModel(): { id: string; info: ModelInfo } {
		return this.cliHandler.getModel()
	}

	/**
	 * Show progress indicator in the VS Code UI
	 */
	private showProgress(message: string): void {
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: message,
				cancellable: false,
			},
			async (_progress) => {
				// This promise resolves when hideProgress is called
				return new Promise<void>((resolve) => {
					// Store the resolve function to be called later
					this.hideProgress = () => {
						resolve()
					}
				})
			},
		)
	}

	/**
	 * Hide progress indicator
	 * This is overwritten by showProgress to resolve the promise
	 */
	private hideProgress: ProgressResolver = () => {
		/* No-op default implementation */
	}

	/**
	 * Track file mentions in the text and update the FileContextTracker
	 *
	 * @param text The text to scan for file mentions
	 */
	private trackFileMentions(text: string): void {
		// Skip if VS Code integration is disabled or tracking isn't available
		if (!this.fileContextTracker || !this.vsCodeIntegrationEnabled || !text) return

		// Use file detector to extract file paths
		const filePaths = this.fileDetector.detectFilePaths(text)

		// Track each detected file path if it exists
		for (const absolutePath of filePaths) {
			// Only track existing files
			vscode.workspace.fs.stat(vscode.Uri.file(absolutePath)).then(
				() => {
					// Make sure tracker still exists when promise resolves
					if (this.fileContextTracker) {
						this.fileContextTracker.trackFileContext(absolutePath, "file_mentioned")
					}
				},
				(_error) => {
					// File doesn't exist, do nothing
				},
			)
		}
	}

	/**
	 * Detect potential file modifications in the text
	 * This uses heuristics to detect when Claude Code might be modifying files
	 *
	 * @param text Text to scan for file modifications
	 * @param fileModifications Map to accumulate detected modifications
	 */
	private detectFileModifications(text: string, fileModifications: FileModificationsMap): void {
		// Skip if text is empty or fileModifications is not a map
		if (!text || !(fileModifications instanceof Map)) return

		// Use file detector to identify potential file modifications
		this.fileDetector.detectFileModifications(text, fileModifications)
	}

	/**
	 * Process detected file modifications and route them through VS Code editor APIs
	 *
	 * @param fileModifications Map of detected file modifications with paths as keys
	 * @returns Promise that resolves when processing is complete
	 */
	private async processDetectedFileModifications(fileModifications: FileModificationsMap): Promise<void> {
		// Skip if VS Code integration is disabled, diff provider isn't available, or no modifications
		if (
			!this.diffViewProvider ||
			!fileModifications ||
			fileModifications.size === 0 ||
			!this.vsCodeIntegrationEnabled
		)
			return

		for (const [filePath, _originalPath] of fileModifications) {
			if (!filePath) continue

			try {
				// Resolve the absolute path
				const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.cwd, filePath)

				// Check if the file exists and was modified
				const fileExists = await this.fileExists(absolutePath)
				if (!fileExists) continue

				// Get the current content
				const content = await this.readFile(absolutePath)

				// Update file context tracking
				if (this.fileContextTracker) {
					this.fileContextTracker.markFileAsEditedByRoo(absolutePath)
					this.fileContextTracker.trackFileContext(absolutePath, "roo_edited")
				}

				// Make sure diffViewProvider is still available
				if (!this.diffViewProvider) return

				// Show the modification in the diff view for review
				this.diffViewProvider.editType = "modify"
				await this.diffViewProvider.open(absolutePath)
				await this.diffViewProvider.update(content, true)

				// Create a local reference to diffViewProvider to ensure it's available in the closure
				const diffViewProvider = this.diffViewProvider

				// Show a message that file modifications were detected
				const fileName = path.basename(absolutePath)
				await vscode.window
					.showInformationMessage(
						t("common:errors.claude_code.file_modified", { fileName }),
						t("common:errors.claude_code.keep_changes"),
						t("common:errors.claude_code.revert_changes"),
					)
					.then(async (selection) => {
						if (selection === t("common:errors.claude_code.keep_changes") && diffViewProvider) {
							await diffViewProvider.saveChanges()
						} else if (diffViewProvider) {
							await diffViewProvider.revertChanges()
						}
					})
			} catch (error) {
				console.error(`Error processing file modification for ${filePath}:`, error)
			}
		}
	}

	/**
	 * Check if a file exists
	 * @param filePath Absolute path to check
	 * @returns Promise that resolves to true if file exists, false otherwise
	 */
	private async fileExists(filePath: string): Promise<boolean> {
		if (!filePath) return false

		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(filePath))
			return true
		} catch (_error) {
			return false
		}
	}

	/**
	 * Read a file's content
	 * @param filePath Absolute path to the file to read
	 * @returns Promise that resolves to the file content as a string
	 * @throws Error if file cannot be read
	 */
	private async readFile(filePath: string): Promise<string> {
		if (!filePath) {
			throw new Error("Invalid file path: file path is empty")
		}

		try {
			const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))
			return Buffer.from(content).toString("utf8")
		} catch (error) {
			throw new Error(`Error reading file ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}

/**
 * Factory function to create a VS Code integrated Claude Code handler
 *
 * @param options Configuration options for the provider
 * @param diffViewProvider VS Code diff view provider for file changes
 * @param fileContextTracker File context tracker for file mentions
 * @param cwd Current working directory (defaults to first workspace folder)
 * @returns Initialized VS Code integrated Claude Code handler
 */
export function createVsCodeIntegratedClaudeCode(
	options: CreateVsCodeIntegratedClaudeCodeOptions,
	diffViewProvider: DiffViewProvider,
	fileContextTracker: FileContextTracker,
	cwd: string = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
): VsCodeIntegratedClaudeCode {
	if (!diffViewProvider) {
		throw new Error("diffViewProvider is required for Claude Code VS Code integration")
	}

	if (!fileContextTracker) {
		throw new Error("fileContextTracker is required for Claude Code VS Code integration")
	}

	// Use configured CWD or default to workspace folder
	const workingDir = options.cwd || cwd

	const handler = new VsCodeIntegratedClaudeCode(options, workingDir)
	handler.initialize(diffViewProvider, fileContextTracker)
	return handler
}
