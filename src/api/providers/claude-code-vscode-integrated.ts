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
import { formatErrorMessage, ErrorFormattingOperation } from "./utils/error-formatter"
import {
	FileModificationsMap,
	ProgressResolver,
	VsCodeIntegratedClaudeCodeOptions,
	StatusReporter,
} from "./models/claude-code-types"

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
	 * This method sets up the VS Code integration by connecting the provider
	 * with VS Code-specific components for UI interaction and file management.
	 * It must be called before using the provider to ensure proper integration.
	 *
	 * @param diffViewProvider - DiffViewProvider instance for handling file diffs and presenting changes to the user
	 * @param fileContextTracker - FileContextTracker instance for tracking file context and access patterns
	 * @param statusReporter - Optional StatusReporter instance for showing status updates in the VS Code UI
	 *
	 * @throws Error if called with invalid parameters
	 *
	 * @example
	 * ```typescript
	 * const provider = new VsCodeIntegratedClaudeCode(options);
	 * provider.initialize(diffViewProvider, fileContextTracker, statusReporter);
	 * ```
	 */
	public initialize(
		diffViewProvider: DiffViewProvider,
		fileContextTracker: FileContextTracker,
		statusReporter?: StatusReporter,
	): void {
		if (!diffViewProvider) {
			throw new Error("DiffViewProvider is required for VS Code integration")
		}

		if (!fileContextTracker) {
			throw new Error("FileContextTracker is required for VS Code integration")
		}

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
				text: formatErrorMessage(error, "message_generation" as ErrorFormattingOperation),
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
			throw new Error(formatErrorMessage(error, "completion" as ErrorFormattingOperation))
		} finally {
			// Clean up UI indicators
			this.hideProgress()
		}
	}

	// Using the shared formatErrorMessage utility function from error-formatter.ts

	/**
	 * Show progress indicator in the VS Code UI
	 *
	 * This method displays a notification-based progress indicator in VS Code
	 * to provide visual feedback while operations are in progress. The progress
	 * indicator remains visible until hideProgress is called.
	 *
	 * The method also sets up the promise resolution mechanism that allows the
	 * progress indicator to be dismissed when hideProgress is called.
	 *
	 * @param message - The progress message to display to the user
	 *
	 * @example
	 * ```typescript
	 * // Show progress during an operation
	 * this.showProgress("Generating response...");
	 * try {
	 *   await timeConsumingOperation();
	 * } finally {
	 *   // Always clean up by hiding the progress
	 *   this.hideProgress();
	 * }
	 * ```
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
	 *
	 * This method dismisses the progress indicator previously shown by showProgress.
	 * The default implementation is a no-op, but it's overwritten by showProgress
	 * to resolve the promise that keeps the progress indicator visible.
	 *
	 * @remarks
	 * This method's implementation is replaced dynamically by showProgress
	 * with a function that resolves the progress promise. This pattern allows
	 * the progress indicator to remain visible for the duration of an operation
	 * and be dismissed when no longer needed.
	 */
	private hideProgress: ProgressResolver = () => {
		/* No-op default implementation */
	}

	/**
	 * Track file mentions in the text and update the FileContextTracker
	 *
	 * This method scans the provided text for file paths using pattern matching,
	 * validates that they exist on the filesystem, and then:
	 * 1. Tracks them in the FileContextTracker for context preservation
	 * 2. Opens mentioned files in VS Code tabs for user visibility
	 *
	 * The method handles both absolute and relative paths, performing path
	 * resolution as needed. It gracefully handles errors to prevent disruption
	 * of the main processing flow.
	 *
	 * @param text - The text to scan for file mentions
	 * @returns Promise that resolves when all file mentions are processed
	 *
	 * @remarks
	 * This method is critical for maintaining context awareness and providing
	 * a good user experience by automatically opening files that Claude mentions
	 * in its responses, making it easier to follow along with code discussions.
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
	 * This method scans text for patterns that indicate Claude Code has modified files,
	 * such as "writing to file", "created file", or code blocks with file headers.
	 * It identifies files that may have been modified by Claude Code's CLI operations
	 * and accumulates them in the provided map for later processing.
	 *
	 * The method delegates pattern matching to the FileDetector class, which contains
	 * extensive pattern matching capabilities for identifying different file operation
	 * formats in the text.
	 *
	 * @param text - Text to scan for file modifications
	 * @param fileModifications - Map to accumulate detected modifications (key: absolute path, value: original path)
	 *
	 * @remarks
	 * This detection is heuristic in nature and based on pattern matching. It works best
	 * when Claude Code follows standard output formats for file operations. The resulting
	 * map is used by processDetectedFileModifications to present changes to the user.
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
	 * This method takes the file modifications detected in Claude Code's response
	 * and routes them through VS Code's editor APIs instead of allowing Claude Code CLI
	 * to directly modify files. The process involves:
	 *
	 * 1. Validating each detected file path
	 * 2. Determining if it's a new file creation or an update to an existing file
	 * 3. Opening the file in VS Code's diff view
	 * 4. Presenting the changes to the user for approval
	 * 5. Applying or reverting the changes based on user input
	 * 6. Reporting status updates to the UI
	 *
	 * This is a critical part of the VS Code integration that provides controlled,
	 * predictable file operations with user oversight rather than direct file modifications.
	 *
	 * @param fileModifications - Map of detected file modifications (key: absolute path, value: original path)
	 * @returns Promise that resolves when all modifications are processed
	 *
	 * @remarks
	 * This method implements an important safety feature by requiring explicit user approval
	 * for each file modification. It also checks for problems after saving and reports
	 * them to the user. The diff view presentation provides transparency about what
	 * changes Claude is making.
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
	 * This method opens a file in a VS Code tab using the VS Code editor API.
	 * It validates that the file exists before attempting to open it and
	 * opens the file in non-preview mode so that the tab remains open.
	 *
	 * This is used when Claude mentions files in its responses to automatically
	 * make them visible to the user, improving the collaborative experience.
	 *
	 * @param filePath - Absolute path to the file to open
	 * @returns Promise that resolves to the text editor, or undefined if the file doesn't exist or an error occurs
	 *
	 * @remarks
	 * The method uses non-preview mode to ensure that tabs stay open even when the
	 * user navigates to other files. This prevents tabs from being reused, which
	 * would make it harder to reference multiple files during a conversation.
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
	 * This method checks if a file exists on the filesystem using VS Code's
	 * file system API. It safely handles errors, returning false if the file
	 * doesn't exist or cannot be accessed.
	 *
	 * @param filePath - Absolute path to check
	 * @returns Promise that resolves to true if file exists, false otherwise
	 *
	 * @remarks
	 * This method is used throughout the VS Code integration to validate file
	 * paths before attempting operations like reading or opening files, providing
	 * a consistent way to check file existence that works with VS Code's virtual
	 * file system (which supports remote files, workspace files, etc.).
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
	 * This method reads a file's content using VS Code's file system API.
	 * It properly handles encoding and error conditions, providing detailed
	 * error messages if the file cannot be read.
	 *
	 * Unlike direct filesystem access, this method works with VS Code's virtual
	 * file system, supporting various file providers including remote files.
	 *
	 * @param filePath - Absolute path to the file to read
	 * @returns Promise that resolves to the file content as a string
	 * @throws Error if file path is empty or the file cannot be read
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   const content = await this.readFile("/path/to/file.js");
	 *   console.log(`File has ${content.length} characters`);
	 * } catch (error) {
	 *   console.error(`Failed to read file: ${error.message}`);
	 * }
	 * ```
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
 * This factory function provides a convenient way to create and initialize a
 * VS Code integrated Claude Code handler with all required components. It
 * performs validation on the required parameters and automatically initializes
 * the handler with the provided components.
 *
 * The factory approach simplifies the creation process and ensures that the handler
 * is properly configured before use.
 *
 * @param options - Configuration options for the provider including model, CLI path, etc.
 * @param diffViewProvider - VS Code diff view provider for presenting file changes
 * @param fileContextTracker - File context tracker for maintaining file context and mentions
 * @param statusReporter - Optional status reporter for UI updates in the VS Code interface
 * @returns Fully initialized VS Code integrated Claude Code handler
 * @throws Error if diffViewProvider or fileContextTracker are not provided
 *
 * @example
 * ```typescript
 * const diffViewProvider = new DiffViewProvider(context);
 * const fileContextTracker = new FileContextTracker();
 * const statusReporter = new StatusReporter();
 *
 * const provider = createVsCodeIntegratedClaudeCode(
 *   { claudeCodePath: "/usr/local/bin/claude-code", claudeCodeModelId: "claude-3-sonnet-20240229" },
 *   diffViewProvider,
 *   fileContextTracker,
 *   statusReporter
 * );
 * ```
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
 *
 * This interface defines the contract for status reporting in the VS Code UI.
 * It provides a standard way to report different types of status updates during
 * Claude Code operations, allowing for consistent UI feedback.
 *
 * The status reporter is used to show progress, completion, errors, and other
 * state changes in the UI, giving users visibility into what Claude Code is doing.
 */
export interface StatusReporterOptions {
	status: "running" | "completed" | "error" | "waiting" | "success" | "warning" | "info" | "thinking"
	message: string
	provider: string
}
