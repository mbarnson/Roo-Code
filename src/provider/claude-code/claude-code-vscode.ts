import * as vscode from "vscode"
import * as path from "path"
import { ClaudeCodeHandler } from "./claude-code"
// Import type to avoid name conflict
import type { DiffViewProvider as DiffViewProviderType } from "./diff-view-provider"
import { t } from "../../i18n"
import type { CompletionResponse, PromptOptions, ProviderOptions } from "./common-types"

// Wrapper for t function to handle record type with default value
function tFormat(key: string, defaultValue: string, params?: Record<string, any>): string {
	// Create options object with default value and params
	const options: Record<string, any> = { defaultValue }

	// Add any additional params
	if (params) {
		Object.assign(options, params)
	}

	// Call t with the correct signature
	return t(key, options)
}

/**
 * Interface for file context tracking
 */
export interface FileContextTracker {
	trackFile(filePath: string): void
	markFileAsEditedByRoo(filePath: string): void
	trackFileContext(filePath: string, reason: string): Promise<void>
}

/**
 * Interface for file operations
 */
export interface FileOperation {
	type: "create" | "update" | "delete" | "rename"
	path: string
	content?: string
	oldPath?: string // For rename operations
}

/**
 * Interface for status reporting
 */
export interface StatusReporter {
	updateStatus(status: string): void
	showError(error: Error): void
	showInfo(message: string): void
	showWarning?(message: string): void
	showSuccess?(message: string): void
}

/**
 * Options for the VS Code integrated Claude Code Handler
 */
export interface VsCodeIntegratedClaudeCodeOptions extends ProviderOptions {
	fileContextTracker?: FileContextTracker
	diffViewProvider?: DiffViewProviderType
	statusReporter?: StatusReporter

	// Include the ClaudeCodeCommandOptions properties
	claudeCodePath?: string
	claudeCodeModelId?: string
	modelTemperature?: number
	includeMaxTokens?: boolean
	modelMaxTokens?: number
	modelMaxThinkingTokens?: number
	reasoningEffort?: "low" | "medium" | "high"
}

/**
 * A wrapper around ClaudeCodeHandler that integrates with VS Code
 * to intercept file operations and route them through VS Code APIs.
 */
export class VsCodeIntegratedClaudeCode extends ClaudeCodeHandler {
	private statusBarItem: vscode.StatusBarItem
	private fileContextTracker?: FileContextTracker
	private diffViewProvider?: DiffViewProviderType
	private statusReporter?: StatusReporter
	private openedTabs = new Set<string>()

	constructor(options: VsCodeIntegratedClaudeCodeOptions) {
		super(options)
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
		this.statusBarItem.text = "Claude Code: Idle"
		this.statusBarItem.show()

		this.fileContextTracker = options.fileContextTracker
		this.diffViewProvider = options.diffViewProvider
		this.statusReporter = options.statusReporter
	}

	/**
	 * For compatibility with ClaudeCodeHandler, but we'll use the VS Code integrated version instead
	 * @hidden
	 */
	override async completePrompt(prompt: string): Promise<string>

	/**
	 * VS Code integrated version of completePrompt that accepts options and returns structured response
	 * @hidden
	 */
	override async completePrompt(options: PromptOptions): Promise<CompletionResponse>

	/**
	 * Implementation of both method signatures
	 */
	override async completePrompt(options: string | PromptOptions): Promise<string | CompletionResponse> {
		this.updateStatus(t("common:status.claude_code.working", { defaultValue: "Working" }))

		try {
			// For string input, maintain compatibility with parent class
			if (typeof options === "string") {
				const responseText = await super.completePrompt(options)
				// For the standard API, just return the string directly
				return responseText
			}

			// For PromptOptions, handle the VS Code integration
			const responseText = await super.completePrompt(options.prompt)
			const result: CompletionResponse = { content: responseText }

			// Process the response to intercept file operations
			if (result.content) {
				await this.processResponse(result)
			}

			this.updateStatus(tFormat("common:status.claude_code.idle", "Idle"))
			return result
		} catch (error) {
			this.updateStatus(tFormat("common:status.claude_code.error", "Error"))
			this.handleError(error)
			throw error
		}
	}

	/**
	 * Process the response to intercept file operations
	 */
	private async processResponse(response: CompletionResponse): Promise<void> {
		// Extract file operations from the response
		const fileOperations = this.parseFileOperationsFromResponse(response.content)

		if (fileOperations.length === 0) {
			return
		}

		// Apply file operations through VS Code APIs
		await this.applyFileOperationsViaVSCode(fileOperations)

		// Update the response to remove file operations if needed
		response.content = this.removeFileOperationsFromResponse(response.content)
	}

	/**
	 * Parse file operations from the response
	 */
	private parseFileOperationsFromResponse(response: string): FileOperation[] {
		const operations: FileOperation[] = []

		// Use regex patterns to detect file operations

		// Detect file creations and updates with content in code blocks
		const fileWritePatterns = [
			// Claude Code explicit file writing syntax
			/writing to file\s+([^\s]+)\s*:\s*```([\s\S]*?)```/gi,

			// File creation with explicit path followed by code block
			/I(?:'ve| have) created (?:a new |the |)file (?:at |called |named |in |)`?([^\s`]+)`?[:\s]*```(?:\w+)?\s*([\s\S]*?)```/gi,

			// Here's the content of file X with code block
			/(?:Here(?:'s| is) the|The) (?:content|code) (?:of|for) `?([^\s`]+)`?[:\s]*```(?:\w+)?\s*([\s\S]*?)```/gi,

			// I've updated file X with code block
			/I(?:'ve| have) (?:updated|modified|changed) (?:the |)file `?([^\s`]+)`?[:\s]*```(?:\w+)?\s*([\s\S]*?)```/gi,

			// Let me create file X with code block
			/(?:Let(?:'s| me)|I'll) create (?:a |the |)(?:new |)file(?: called| at| named)? `?([^\s`]+)`?[:\s]*```(?:\w+)?\s*([\s\S]*?)```/gi,

			// Code block with file path in comment/header
			/```(?:\w+)?\s*(?:\/\/|#)\s*([^\n]+)\s*\n([\s\S]*?)```/gi,
		]

		// Process each file write pattern
		for (const pattern of fileWritePatterns) {
			let match
			while ((match = pattern.exec(response)) !== null) {
				let path = match[1].trim()
				let content = match[2]

				// For code blocks with comments, clean up the path
				if (pattern.toString().includes("//|#")) {
					// Remove any comment indicators from the path
					path = path.replace(/^(?:\/\/|#|\*)\s*/, "")

					// Skip paths that don't look like file paths
					if (!/\.\w+$/.test(path) || /^(output|result|example|log|console)/i.test(path)) {
						continue
					}
				}

				// Check if the file exists to determine if this is an update or create
				const fileExists = this.fileExists(path)

				operations.push({
					type: fileExists ? "update" : "create",
					path,
					content,
				})
			}
		}

		// Detect file deletions
		const fileDeletePatterns = [
			/deleting file\s+([^\s]+)/gi,
			/I(?:'ve| have| will) delete(?:d)? (?:the |)file `?([^\s`]+)`?/gi,
			/Let(?:'s| me) delete (?:the |)file `?([^\s`]+)`?/gi,
			/(?:The |)file `?([^\s`]+)`? (?:has been|should be) deleted/gi,
		]

		for (const pattern of fileDeletePatterns) {
			let match
			while ((match = pattern.exec(response)) !== null) {
				const path = match[1].trim()

				operations.push({
					type: "delete",
					path,
				})
			}
		}

		// Detect file renames
		const fileRenamePatterns = [
			/renaming file\s+([^\s]+)\s+to\s+([^\s]+)/gi,
			/I(?:'ve| have| will) rename(?:d)? (?:the |)file `?([^\s`]+)`? to `?([^\s`]+)`?/gi,
			/Let(?:'s| me) rename (?:the |)file `?([^\s`]+)`? to `?([^\s`]+)`?/gi,
			/Move(?:d)? (?:the |)file from `?([^\s`]+)`? to `?([^\s`]+)`?/gi,
		]

		for (const pattern of fileRenamePatterns) {
			let match
			while ((match = pattern.exec(response)) !== null) {
				const oldPath = match[1].trim()
				const newPath = match[2].trim()

				operations.push({
					type: "rename",
					path: newPath,
					oldPath,
				})
			}
		}

		return operations
	}

	/**
	 * Check if a file exists
	 */
	private fileExists(path: string): boolean {
		try {
			const stat = vscode.workspace.fs.stat(vscode.Uri.file(path))
			return !!stat
		} catch (error) {
			return false
		}
	}

	/**
	 * Remove file operations from the response
	 */
	private removeFileOperationsFromResponse(response: string): string {
		// Replace file operation sections with a more VS Code appropriate message
		let modifiedResponse = response

		// Handle Claude Code explicit operation patterns
		modifiedResponse = modifiedResponse.replace(
			/writing to file\s+([^\s]+)\s*:\s*```(?:\w+)?\s*([\s\S]*?)```/gi,
			"File $1 has been updated in VS Code",
		)

		modifiedResponse = modifiedResponse.replace(/deleting file\s+([^\s]+)/gi, "File $1 has been deleted in VS Code")

		modifiedResponse = modifiedResponse.replace(
			/renaming file\s+([^\s]+)\s+to\s+([^\s]+)/gi,
			"File $1 has been renamed to $2 in VS Code",
		)

		// Handle natural language patterns with code blocks

		// File creation with explicit path followed by code block
		modifiedResponse = modifiedResponse.replace(
			/I(?:'ve| have) created (?:a new |the |)file (?:at |called |named |in |)`?([^\s`]+)`?[:\s]*```(?:\w+)?\s*([\s\S]*?)```/gi,
			"File $1 has been created in VS Code",
		)

		// Here's the content of file X with code block
		modifiedResponse = modifiedResponse.replace(
			/(?:Here(?:'s| is) the|The) (?:content|code) (?:of|for) `?([^\s`]+)`?[:\s]*```(?:\w+)?\s*([\s\S]*?)```/gi,
			"File $1 has been updated in VS Code",
		)

		// I've updated file X with code block
		modifiedResponse = modifiedResponse.replace(
			/I(?:'ve| have) (?:updated|modified|changed) (?:the |)file `?([^\s`]+)`?[:\s]*```(?:\w+)?\s*([\s\S]*?)```/gi,
			"File $1 has been updated in VS Code",
		)

		// Let me create file X with code block
		modifiedResponse = modifiedResponse.replace(
			/(?:Let(?:'s| me)|I'll) create (?:a |the |)(?:new |)file(?: called| at| named)? `?([^\s`]+)`?[:\s]*```(?:\w+)?\s*([\s\S]*?)```/gi,
			"File $1 has been created in VS Code",
		)

		// Handle code blocks with file headers
		modifiedResponse = modifiedResponse.replace(
			/```(?:\w+)?\s*(?:\/\/|#)\s*([^\n]+)\s*\n([\s\S]*?)```/gi,
			(match, filePath) => {
				// Skip replacing if this doesn't look like a file path
				if (!/\.\w+$/.test(filePath) || /^(output|result|example|log|console)/i.test(filePath)) {
					return match
				}
				// Clean up the path
				const cleanPath = filePath.replace(/^(?:\/\/|#|\*)\s*/, "")
				return `File ${cleanPath} has been updated in VS Code`
			},
		)

		// Handle deletion patterns
		modifiedResponse = modifiedResponse.replace(
			/I(?:'ve| have| will) delete(?:d)? (?:the |)file `?([^\s`]+)`?/gi,
			"File $1 has been deleted in VS Code",
		)

		modifiedResponse = modifiedResponse.replace(
			/Let(?:'s| me) delete (?:the |)file `?([^\s`]+)`?/gi,
			"File $1 has been deleted in VS Code",
		)

		// Handle rename patterns
		modifiedResponse = modifiedResponse.replace(
			/I(?:'ve| have| will) rename(?:d)? (?:the |)file `?([^\s`]+)`? to `?([^\s`]+)`?/gi,
			"File $1 has been renamed to $2 in VS Code",
		)

		modifiedResponse = modifiedResponse.replace(
			/Let(?:'s| me) rename (?:the |)file `?([^\s`]+)`? to `?([^\s`]+)`?/gi,
			"File $1 has been renamed to $2 in VS Code",
		)

		modifiedResponse = modifiedResponse.replace(
			/Move(?:d)? (?:the |)file from `?([^\s`]+)`? to `?([^\s`]+)`?/gi,
			"File $1 has been moved to $2 in VS Code",
		)

		return modifiedResponse
	}

	/**
	 * Apply file operations via VS Code APIs
	 */
	private async applyFileOperationsViaVSCode(operations: FileOperation[]): Promise<void> {
		// Group operations by type for better user experience
		const creates = operations.filter((op) => op.type === "create")
		const updates = operations.filter((op) => op.type === "update")
		const deletes = operations.filter((op) => op.type === "delete")
		const renames = operations.filter((op) => op.type === "rename")

		// Get VS Code workspace edit for batch processing
		const workspaceEdit = new vscode.WorkspaceEdit()
		const operationResults: { success: boolean; path: string; error?: string }[] = []

		// Show progress indicator
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: tFormat("common:progress.claude_code.applyingChanges", "Applying Claude Code changes"),
				cancellable: true,
			},
			async (progress, token) => {
				token.onCancellationRequested(() => {
					throw new Error(tFormat("common:errors.claude_code.cancelled", "File operations cancelled"))
				})

				// Process creates
				if (creates.length > 0) {
					progress.report({
						message: tFormat("common:progress.claude_code.creatingFiles", "Creating files..."),
						increment: 25,
					})

					for (const op of creates) {
						try {
							// For create operations, we'll use the file system APIs first to ensure
							// parent directories exist, then use the editor APIs for the content

							// Ensure directory exists
							const dirUri = vscode.Uri.file(path.dirname(op.path))
							await vscode.workspace.fs.createDirectory(dirUri)

							// Create file with empty content initially
							const fileUri = vscode.Uri.file(op.path)

							// Add to workspace edit
							workspaceEdit.createFile(fileUri, { overwrite: false })

							// If content is provided, add a text edit to insert it
							if (op.content) {
								workspaceEdit.insert(fileUri, new vscode.Position(0, 0), op.content)
							}

							// Track success
							operationResults.push({ success: true, path: op.path })

							// Update file context
							if (this.fileContextTracker) {
								this.fileContextTracker.trackFile(op.path)
								this.fileContextTracker.markFileAsEditedByRoo(op.path)
							}
						} catch (error) {
							console.error(`Error creating file ${op.path}:`, error)
							operationResults.push({
								success: false,
								path: op.path,
								error: error instanceof Error ? error.message : String(error),
							})
						}
					}
				}

				// Process updates
				if (updates.length > 0) {
					progress.report({
						message: tFormat("common:progress.claude_code.updatingFiles", "Updating files..."),
						increment: 25,
					})

					for (const op of updates) {
						try {
							const fileUri = vscode.Uri.file(op.path)

							// Check if file exists
							try {
								await vscode.workspace.fs.stat(fileUri)

								// For existing files, open them first to allow proper diff view
								const doc = await vscode.workspace.openTextDocument(fileUri)

								// Use the diffViewProvider if available
								if (this.diffViewProvider && op.content) {
									// Show diff and wait for approval
									const currentContent = doc.getText()
									const approved = await this.diffViewProvider.showDiff(
										op.path,
										currentContent,
										op.content,
									)

									if (approved) {
										// Replace entire content
										const entireRange = new vscode.Range(
											doc.positionAt(0),
											doc.positionAt(doc.getText().length),
										)
										workspaceEdit.replace(fileUri, entireRange, op.content)

										operationResults.push({ success: true, path: op.path })
									} else {
										operationResults.push({
											success: false,
											path: op.path,
											error: "User rejected changes",
										})
										continue
									}
								} else {
									// No diff provider, use direct edit
									// Replace entire content
									const entireRange = new vscode.Range(
										doc.positionAt(0),
										doc.positionAt(doc.getText().length),
									)
									workspaceEdit.replace(fileUri, entireRange, op.content || "")

									operationResults.push({ success: true, path: op.path })
								}

								// Update file context
								if (this.fileContextTracker) {
									this.fileContextTracker.trackFile(op.path)
									this.fileContextTracker.markFileAsEditedByRoo(op.path)
								}
							} catch (error) {
								// File doesn't exist, treat as create
								const dirUri = vscode.Uri.file(path.dirname(op.path))
								await vscode.workspace.fs.createDirectory(dirUri)

								workspaceEdit.createFile(fileUri, { overwrite: false })

								if (op.content) {
									workspaceEdit.insert(fileUri, new vscode.Position(0, 0), op.content)
								}

								operationResults.push({ success: true, path: op.path })

								// Update file context
								if (this.fileContextTracker) {
									this.fileContextTracker.trackFile(op.path)
									this.fileContextTracker.markFileAsEditedByRoo(op.path)
								}
							}
						} catch (error) {
							console.error(`Error updating file ${op.path}:`, error)
							operationResults.push({
								success: false,
								path: op.path,
								error: error instanceof Error ? error.message : String(error),
							})
						}
					}
				}

				// Process deletes
				if (deletes.length > 0) {
					progress.report({
						message: tFormat("common:progress.claude_code.deletingFiles", "Deleting files..."),
						increment: 25,
					})

					for (const op of deletes) {
						try {
							// Confirm deletion with user
							const confirmed = await vscode.window.showWarningMessage(
								tFormat(
									"common:warnings.claude_code.confirmDelete",
									"Are you sure you want to delete {path}?",
									{ path: op.path },
								),
								{ modal: true },
								tFormat("common:buttons.delete", "Delete"),
								tFormat("common:buttons.cancel", "Cancel"),
							)

							if (confirmed === tFormat("common:buttons.delete", "Delete")) {
								const fileUri = vscode.Uri.file(op.path)
								workspaceEdit.deleteFile(fileUri, { ignoreIfNotExists: true })

								operationResults.push({ success: true, path: op.path })

								// Update opened tabs tracking if needed
								this.openedTabs.delete(op.path)
							} else {
								operationResults.push({
									success: false,
									path: op.path,
									error: "User cancelled deletion",
								})
							}
						} catch (error) {
							console.error(`Error deleting file ${op.path}:`, error)
							operationResults.push({
								success: false,
								path: op.path,
								error: error instanceof Error ? error.message : String(error),
							})
						}
					}
				}

				// Process renames
				if (renames.length > 0) {
					progress.report({
						message: tFormat("common:progress.claude_code.renamingFiles", "Renaming files..."),
						increment: 25,
					})

					for (const op of renames) {
						try {
							if (op.oldPath) {
								const oldUri = vscode.Uri.file(op.oldPath)
								const newUri = vscode.Uri.file(op.path)

								// Ensure target directory exists
								const dirUri = vscode.Uri.file(path.dirname(op.path))
								await vscode.workspace.fs.createDirectory(dirUri)

								// Add rename operation to workspace edit
								workspaceEdit.renameFile(oldUri, newUri)

								operationResults.push({ success: true, path: op.path })

								// Update opened tabs tracking if needed
								this.openedTabs.delete(op.oldPath)

								// Update file context
								if (this.fileContextTracker) {
									this.fileContextTracker.trackFile(op.path)
									this.fileContextTracker.markFileAsEditedByRoo(op.path)
								}
							}
						} catch (error) {
							console.error(`Error renaming file ${op.oldPath} to ${op.path}:`, error)
							operationResults.push({
								success: false,
								path: op.path,
								error: error instanceof Error ? error.message : String(error),
							})
						}
					}
				}

				// Apply all workspace edits as a single transaction
				try {
					// Apply all edits in one transaction
					const editSuccess = await vscode.workspace.applyEdit(workspaceEdit)

					if (!editSuccess) {
						console.error("Failed to apply some workspace edits")
						this.handleError(
							new Error(
								tFormat("common:errors.claude_code.edit_failed", "Failed to apply some file changes"),
							),
						)
					}

					// Open files in tabs after edits are applied
					for (const op of [...creates, ...updates]) {
						if (operationResults.find((r) => r.path === op.path && r.success)) {
							await this.openFileInTab(op.path)
						}
					}
				} catch (error) {
					console.error("Error applying workspace edits:", error)
					this.handleError(
						new Error(
							tFormat("common:errors.claude_code.edit_failed", "Failed to apply file changes: {error}", {
								error: error instanceof Error ? error.message : String(error),
							}),
						),
					)
				}

				// Show summary of results
				const successCount = operationResults.filter((r) => r.success).length
				const totalCount = operationResults.length

				if (successCount < totalCount) {
					const failedOps = operationResults.filter((r) => !r.success)

					const warningMessage = tFormat(
						"common:warnings.claude_code.partial_success",
						"Applied {success} of {total} file operations. {failed} operations failed.",
						{ success: successCount, total: totalCount, failed: totalCount - successCount },
					)

					this.showWarning(warningMessage)
					console.error("Failed operations:", failedOps)

					// Update status to warn
					this.updateStatus(tFormat("common:status.claude_code.warning", "Warning"))
				} else if (totalCount > 0) {
					const successMessage = tFormat(
						"common:info.claude_code.success",
						"Successfully applied {count} file operations",
						{ count: successCount },
					)

					this.showSuccess(successMessage)

					// Update status to show success
					this.updateStatus(tFormat("common:status.claude_code.success", "Success"))
				}
			},
		)
	}

	/**
	 * Create a file and open it in a tab
	 */
	private async createFile(path: string, content: string): Promise<void> {
		try {
			// Ensure the directory exists
			const dirUri = vscode.Uri.file(path.substring(0, path.lastIndexOf("/")))
			await vscode.workspace.fs.createDirectory(dirUri)

			// Create the file
			const fileUri = vscode.Uri.file(path)
			await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content))

			// Open the file in a tab
			await this.openFileInTab(path)

			// Update context tracking
			this.updateFileContext(path)

			// Log creation
			this.showSuccess(tFormat("claudeCode.info.fileCreated", "Created file: {path}", { path }))
		} catch (error) {
			this.handleError(
				new Error(tFormat("claudeCode.error.createFailed", "Failed to create file {path}", { path })),
			)
		}
	}

	/**
	 * Update a file with diff view if available
	 */
	private async updateFile(path: string, content: string): Promise<void> {
		try {
			// Get the current file content
			const fileUri = vscode.Uri.file(path)
			let currentContent = ""

			try {
				const fileData = await vscode.workspace.fs.readFile(fileUri)
				currentContent = Buffer.from(fileData).toString("utf8")
			} catch (error) {
				// File doesn't exist, treat as create
				return this.createFile(path, content)
			}

			// If the content is the same, no need to update
			if (currentContent === content) {
				return
			}

			// Use diff view if available
			if (this.diffViewProvider) {
				const approved = await this.diffViewProvider.showDiff(path, currentContent, content)

				if (!approved) {
					this.showInfo(tFormat("claudeCode.info.updateRejected", "Update to {path} was rejected", { path }))
					return
				}
			}

			// Update the file
			await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content))

			// Open the file in a tab
			await this.openFileInTab(path)

			// Update context tracking
			this.updateFileContext(path)

			// Log update
			this.showSuccess(tFormat("claudeCode.info.fileUpdated", "Updated file: {path}", { path }))
		} catch (error) {
			this.handleError(
				new Error(tFormat("claudeCode.error.updateFailed", "Failed to update file {path}", { path })),
			)
		}
	}

	/**
	 * Delete a file with confirmation
	 */
	private async deleteFile(path: string): Promise<void> {
		try {
			// Confirm deletion
			const confirmed = await vscode.window.showWarningMessage(
				tFormat("claudeCode.warning.confirmDelete", "Are you sure you want to delete {path}?", { path }),
				{ modal: true },
				tFormat("claudeCode.button.delete", "Delete"),
			)

			if (confirmed !== tFormat("claudeCode.button.delete", "Delete")) {
				return
			}

			// Delete the file
			const fileUri = vscode.Uri.file(path)
			await vscode.workspace.fs.delete(fileUri)

			// Remove from opened tabs
			this.openedTabs.delete(path)

			// Log deletion
			this.showSuccess(tFormat("claudeCode.info.fileDeleted", "Deleted file: {path}", { path }))
		} catch (error) {
			this.handleError(
				new Error(tFormat("claudeCode.error.deleteFailed", "Failed to delete file {path}", { path })),
			)
		}
	}

	/**
	 * Rename a file
	 */
	private async renameFile(oldPath: string, newPath: string): Promise<void> {
		try {
			// Get the current file content
			const oldUri = vscode.Uri.file(oldPath)
			const newUri = vscode.Uri.file(newPath)

			// Ensure the directory exists
			const dirUri = vscode.Uri.file(newPath.substring(0, newPath.lastIndexOf("/")))
			await vscode.workspace.fs.createDirectory(dirUri)

			// Rename the file
			await vscode.workspace.fs.rename(oldUri, newUri)

			// Open the new file in a tab
			await this.openFileInTab(newPath)

			// Update context tracking
			this.updateFileContext(newPath)

			// Remove old file from tracking
			this.openedTabs.delete(oldPath)

			// Log rename
			this.showSuccess(
				tFormat("claudeCode.info.fileRenamed", "Renamed file: {oldPath} to {newPath}", { oldPath, newPath }),
			)
		} catch (error) {
			this.handleError(
				new Error(
					tFormat("claudeCode.error.renameFailed", "Failed to rename file {oldPath} to {newPath}", {
						oldPath,
						newPath,
					}),
				),
			)
		}
	}

	/**
	 * Open a file in a tab
	 */
	private async openFileInTab(path: string): Promise<vscode.TextEditor | undefined> {
		try {
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path))
			const editor = await vscode.window.showTextDocument(document, { preview: false })
			this.openedTabs.add(path)
			return editor
		} catch (error) {
			this.handleError(new Error(tFormat("claudeCode.error.openFailed", "Failed to open file {path}", { path })))
			return undefined
		}
	}

	/**
	 * Update file context
	 */
	private updateFileContext(path: string): void {
		if (this.fileContextTracker) {
			this.fileContextTracker.trackFile(path)
		}
	}

	/**
	 * Update status
	 */
	private updateStatus(status: string): void {
		this.statusBarItem.text = `Claude Code: ${status}`

		if (this.statusReporter) {
			this.statusReporter.updateStatus(status)
		}
	}

	/**
	 * Show info message
	 */
	private showInfo(message: string): void {
		vscode.window.showInformationMessage(message)

		if (this.statusReporter) {
			this.statusReporter.showInfo(message)
		}
	}

	/**
	 * Show warning message
	 */
	private showWarning(message: string): void {
		vscode.window.showWarningMessage(message)

		if (this.statusReporter && this.statusReporter.showWarning) {
			this.statusReporter.showWarning(message)
		}
	}

	/**
	 * Show success message
	 */
	private showSuccess(message: string): void {
		vscode.window.showInformationMessage(message)

		if (this.statusReporter && this.statusReporter.showSuccess) {
			this.statusReporter.showSuccess(message)
		}
	}

	/**
	 * Handle error
	 */
	private handleError(error: Error): void {
		vscode.window.showErrorMessage(error.message)

		if (this.statusReporter) {
			this.statusReporter.showError(error)
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.statusBarItem.dispose()
	}
}

/**
 * Export the DiffViewProvider interface to avoid conflicts
 * with the imported type
 */
export { DiffViewProviderType as DiffViewProvider }

/**
 * Create a VS Code integrated Claude Code handler
 */
export function createVsCodeIntegratedClaudeCode(
	options: VsCodeIntegratedClaudeCodeOptions,
): VsCodeIntegratedClaudeCode {
	return new VsCodeIntegratedClaudeCode(options)
}
