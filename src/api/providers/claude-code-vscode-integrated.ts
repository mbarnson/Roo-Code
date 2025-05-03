import * as vscode from "vscode"
import * as path from "path"
import { Anthropic } from "@anthropic-ai/sdk"
import { ApiStream } from "../transform/stream"
import { ApiHandler, SingleCompletionHandler } from "../index"
import { ClaudeCodeHandler } from "./claude-code"
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"
import { FileContextTracker } from "../../core/context-tracking/FileContextTracker"
import { FileDetector } from "./utils/file-detector"
import { t } from "../../i18n"
import { StatusReporter } from "../../core/status/StatusReporter"
import { FileModificationsMap, ProgressResolver } from "./models/claude-code-vscode-types"
import { VsCodeIntegratedClaudeCodeOptions } from "./models/claude-code-vscode-types"

/**
 * VS Code integrated wrapper for the Claude Code CLI provider
 * This class extends ClaudeCodeHandler to intercept file operations
 * and route them through VS Code's editor APIs
 */
export class VsCodeIntegratedClaudeCode extends ClaudeCodeHandler implements ApiHandler, SingleCompletionHandler {
	private diffViewProvider: DiffViewProvider | undefined
	private fileContextTracker: FileContextTracker | undefined
	private statusReporter: StatusReporter | undefined
	private fileDetector: FileDetector
	private isExecutingCommand = false
	private vsCodeIntegrationEnabled: boolean

	/**
	 * Creates a new VS Code integrated Claude Code handler
	 *
	 * @param options Configuration options for the Claude Code provider
	 * @param cwd Current working directory for resolving file paths
	 */
	private workingDirectory: string

	constructor(options: VsCodeIntegratedClaudeCodeOptions & { cwd?: string }) {
		super({
			claudeCodePath: options.claudeCodePath,
			claudeCodeModelId: options.claudeCodeModelId,
			modelTemperature: options.modelTemperature,
			includeMaxTokens: options.includeMaxTokens,
			modelMaxTokens: options.modelMaxTokens,
			modelMaxThinkingTokens: options.modelMaxThinkingTokens,
			reasoningEffort: options.reasoningEffort,
		})
		this.workingDirectory = options.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ""

		// Default to enabled unless explicitly disabled
		this.vsCodeIntegrationEnabled = options.claudeCodeVsCodeIntegration !== false

		// Initialize file detector
		this.fileDetector = new FileDetector(this.workingDirectory)
	}

	/**
	 * Initialize the wrapper with VS Code components
	 *
	 * @param diffViewProvider DiffViewProvider instance for handling file diffs
	 * @param fileContextTracker FileContextTracker instance for tracking file context
	 * @param statusReporter Optional StatusReporter instance for showing UI status
	 */
	public initialize(
		diffViewProvider: DiffViewProvider,
		fileContextTracker: FileContextTracker,
		statusReporter?: StatusReporter,
	): void {
		this.diffViewProvider = diffViewProvider
		this.fileContextTracker = fileContextTracker
		this.statusReporter = statusReporter
	}

	/**
	 * Create a message using the Claude Code CLI with VS Code integration
	 *
	 * This extends the base createMessage method to add:
	 * 1. Status reporting in the VS Code UI
	 * 2. File mention tracking and context management
	 * 3. Tab management for mentioned files
	 * 4. File modification interception
	 *
	 * @param systemPrompt The system prompt to send to Claude
	 * @param messages The messages to send to Claude
	 * @returns A stream of responses from Claude
	 */
	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		try {
			// Show progress in the VS Code UI
			this.showProgress(t("common:status.claude_code.generating_response"))

			if (this.statusReporter) {
				this.statusReporter.reportStatus({
					status: "running",
					message: t("common:status.claude_code.thinking"),
					provider: "claude-code",
				})
			}

			// Store file modifications detected during response generation
			const fileModifications = new Map<string, string>()

			// Use the parent class's implementation to get the raw response stream
			const cliStream = await super.createMessage(systemPrompt, messages)

			// Process the stream to intercept file operations
			for await (const chunk of cliStream) {
				// Track file mentions in the text chunks
				if (chunk.type === "text" && chunk.text) {
					await this.trackFileMentions(chunk.text)

					// Intercept file paths that might be getting modified
					this.detectFileModifications(chunk.text, fileModifications)
				}

				// Update status for reasoning blocks
				if (chunk.type === "reasoning" && this.statusReporter) {
					this.statusReporter.reportStatus({
						status: "thinking",
						message: t("common:status.claude_code.reasoning"),
						provider: "claude-code",
					})
				}

				yield chunk
			}

			// Handle any detected file modifications after response is complete
			await this.processDetectedFileModifications(fileModifications)

			// Update status when complete
			if (this.statusReporter) {
				this.statusReporter.reportStatus({
					status: "completed",
					message: t("common:status.claude_code.response_complete"),
					provider: "claude-code",
				})
			}
		} catch (error) {
			console.error("Error in VS Code integrated Claude Code createMessage:", error)

			// Update status on error
			if (this.statusReporter) {
				this.statusReporter.reportStatus({
					status: "error",
					message: t("common:status.claude_code.response_error"),
					provider: "claude-code",
				})
			}

			yield {
				type: "text",
				text: this.formatErrorMessage(error, "message_generation"),
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
	override async completePrompt(prompt: string): Promise<string> {
		try {
			// Show progress in the VS Code UI
			this.showProgress(t("common:status.claude_code.generating_completion"))

			if (this.statusReporter) {
				this.statusReporter.reportStatus({
					status: "running",
					message: t("common:status.claude_code.thinking"),
					provider: "claude-code",
				})
			}

			// Execute completion through parent class
			const completion = await super.completePrompt(prompt)

			// Track file mentions in the completion
			await this.trackFileMentions(completion)

			// Update status when complete
			if (this.statusReporter) {
				this.statusReporter.reportStatus({
					status: "completed",
					message: t("common:status.claude_code.completion_complete"),
					provider: "claude-code",
				})
			}

			return completion
		} catch (error) {
			console.error("Error in VS Code integrated Claude Code completePrompt:", error)

			// Update status on error
			if (this.statusReporter) {
				this.statusReporter.reportStatus({
					status: "error",
					message: t("common:status.claude_code.completion_error"),
					provider: "claude-code",
				})
			}

			// Convert error to a standardized format and rethrow
			throw new Error(this.formatErrorMessage(error, "completion"))
		} finally {
			// Clean up UI indicators
			this.hideProgress()
		}
	}

	/**
	 * Standardized error handling for Claude Code operations
	 *
	 * @param error The error to handle
	 * @param operation Description of the operation that failed
	 * @returns A formatted error message for display
	 */
	private formatErrorMessage(error: unknown, operation: string): string {
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
	 * Show progress indicator in the VS Code UI
	 *
	 * @param message The progress message to display
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
	private async trackFileMentions(text: string): Promise<void> {
		// Skip if VS Code integration is disabled or tracking isn't available
		if (!this.fileContextTracker || !this.vsCodeIntegrationEnabled || !text) return

		// Use file detector to extract file paths
		const filePaths = this.fileDetector.detectFilePaths(text)

		// Track each detected file path if it exists
		for (const filePath of filePaths) {
			try {
				// Convert to absolute path if necessary
				const absolutePath = path.isAbsolute(filePath)
					? filePath
					: path.resolve(this.workingDirectory, filePath)

				// Check if file exists
				const exists = await this.fileExists(absolutePath)
				if (exists) {
					// Track in context tracker
					await this.fileContextTracker.trackFileContext(absolutePath, "file_mentioned")

					// Open file in tab when mentioned
					await this.openFileInTab(absolutePath)
				}
			} catch (error) {
				console.warn(`Error tracking file mention for ${filePath}:`, error)
			}
		}
	}

	/**
	 * Detect potential file modifications in the text
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
	 * @param fileModifications Map of detected file modifications
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
				const absolutePath = path.isAbsolute(filePath)
					? filePath
					: path.resolve(this.workingDirectory, filePath)

				// Check if the file exists
				const fileExists = await this.fileExists(absolutePath)

				// Determine edit type based on file existence
				this.diffViewProvider.editType = fileExists ? "modify" : "create"

				// Get the current content if file exists
				let content = ""
				if (fileExists) {
					content = await this.readFile(absolutePath)
				}

				// Update file context tracking
				if (this.fileContextTracker) {
					this.fileContextTracker.markFileAsEditedByRoo(absolutePath)
					this.fileContextTracker.trackFileContext(absolutePath, "roo_edited")
				}

				// Open file in diff view
				await this.diffViewProvider.open(absolutePath)
				await this.diffViewProvider.update(content, true)

				// Show a message that file modifications were detected
				const fileName = path.basename(absolutePath)

				if (this.statusReporter) {
					this.statusReporter.reportStatus({
						status: "waiting",
						message: t("common:status.claude_code.file_modified", { fileName }),
						provider: "claude-code",
					})
				}

				// Ask user to approve changes
				const selection = await vscode.window.showInformationMessage(
					t("common:messages.claude_code.file_modified", { fileName }),
					t("common:actions.claude_code.keep_changes"),
					t("common:actions.claude_code.revert_changes"),
				)

				// Apply or revert changes based on user selection
				if (selection === t("common:actions.claude_code.keep_changes")) {
					const result = await this.diffViewProvider.saveChanges()

					// Check for new problems after saving
					if (result.newProblemsMessage) {
						if (this.statusReporter) {
							this.statusReporter.reportStatus({
								status: "warning",
								message: t("common:status.claude_code.file_has_problems", { fileName }),
								provider: "claude-code",
							})
						}
					} else {
						if (this.statusReporter) {
							this.statusReporter.reportStatus({
								status: "success",
								message: t("common:status.claude_code.file_saved", { fileName }),
								provider: "claude-code",
							})
						}
					}
				} else {
					await this.diffViewProvider.revertChanges()

					if (this.statusReporter) {
						this.statusReporter.reportStatus({
							status: "info",
							message: t("common:status.claude_code.changes_reverted", { fileName }),
							provider: "claude-code",
						})
					}
				}
			} catch (error) {
				console.error(`Error processing file modification for ${filePath}:`, error)

				if (this.statusReporter) {
					this.statusReporter.reportStatus({
						status: "error",
						message: t("common:status.claude_code.file_error", {
							fileName: path.basename(filePath),
							error: error instanceof Error ? error.message : String(error),
						}),
						provider: "claude-code",
					})
				}
			}
		}
	}

	/**
	 * Open a file in a VS Code tab
	 *
	 * @param filePath Absolute path to the file
	 * @returns Promise that resolves to the text editor
	 */
	private async openFileInTab(filePath: string): Promise<vscode.TextEditor | undefined> {
		try {
			const uri = vscode.Uri.file(filePath)

			// Check if file exists
			const exists = await this.fileExists(filePath)
			if (!exists) return undefined

			// Open document in editor
			const document = await vscode.workspace.openTextDocument(uri)

			// Show in active editor group, non-preview mode to keep tab open
			return await vscode.window.showTextDocument(document, {
				preview: false,
				viewColumn: vscode.ViewColumn.Active,
			})
		} catch (error) {
			console.error(`Error opening file in tab: ${filePath}`, error)
			return undefined
		}
	}

	/**
	 * Check if a file exists
	 *
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
	 * Read a file's content using VS Code APIs
	 *
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
 * @param statusReporter Optional status reporter for UI updates
 * @param cwd Current working directory (defaults to first workspace folder)
 * @returns Initialized VS Code integrated Claude Code handler
 */
export function createVsCodeIntegratedClaudeCode(
	options: VsCodeIntegratedClaudeCodeOptions,
	diffViewProvider: DiffViewProvider,
	fileContextTracker: FileContextTracker,
	statusReporter?: StatusReporter,
): VsCodeIntegratedClaudeCode {
	if (!diffViewProvider) {
		throw new Error("diffViewProvider is required for Claude Code VS Code integration")
	}

	if (!fileContextTracker) {
		throw new Error("fileContextTracker is required for Claude Code VS Code integration")
	}

	// Use configured CWD or default to workspace folder
	const handler = new VsCodeIntegratedClaudeCode(options)
	handler.initialize(diffViewProvider, fileContextTracker, statusReporter)
	return handler
}

/**
 * Interface for the status reporter used to update UI
 */
export interface StatusReporterOptions {
	status: "running" | "completed" | "error" | "waiting" | "success" | "warning" | "info" | "thinking"
	message: string
	provider: string
}
