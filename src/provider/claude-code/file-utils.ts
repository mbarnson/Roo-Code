/**
 * Utility functions for file operations in Claude Code provider
 *
 * This module contains reusable utility functions for handling
 * common file operations like create, update, delete, and rename,
 * reducing code duplication and improving maintainability.
 */

import * as vscode from "vscode"
import * as path from "path"
import { ClaudeCodeFileOperationError, ClaudeCodeVsCodeError } from "./errors"
import type { DiffViewProvider } from "./diff-view-provider"
import type { FileContextTracker } from "./claude-code-vscode"
import { normalizePath } from "./path-utils"
import { executeFileOperationInSequence } from "./concurrency-utils"

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
 * Handler function type for error handling
 */
export type ErrorHandler = (error: Error) => void

/**
 * Options for file operations
 */
export interface FileOperationOptions {
	diffViewProvider?: DiffViewProvider
	fileContextTracker?: FileContextTracker
	statusReporter?: StatusReporter
	errorHandler: ErrorHandler
	translationFunction: (key: string, defaultValue: string, params?: Record<string, any>) => string
}

/**
 * Create a new directory and all parent directories
 *
 * @param dirPath - Path to the directory to create
 * @returns Promise resolving when directory is created
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
	try {
		const dirUri = vscode.Uri.file(dirPath)
		await vscode.workspace.fs.createDirectory(dirUri)
	} catch (error) {
		throw new ClaudeCodeFileOperationError(
			`Failed to create directory: ${dirPath}`,
			dirPath,
			"createDirectory",
			error instanceof Error ? error : new Error(String(error)),
		)
	}
}

/**
 * Read file content as string
 *
 * @param filePath - Path to the file to read
 * @returns Promise resolving to file content as string
 */
export async function readFileContent(filePath: string): Promise<string> {
	try {
		const fileUri = vscode.Uri.file(filePath)
		const fileData = await vscode.workspace.fs.readFile(fileUri)
		return Buffer.from(fileData).toString("utf8")
	} catch (error) {
		throw new ClaudeCodeFileOperationError(
			`Failed to read file: ${filePath}`,
			filePath,
			"readFile",
			error instanceof Error ? error : new Error(String(error)),
		)
	}
}

/**
 * Write content to a file
 *
 * @param filePath - Path to the file to write
 * @param content - Content to write to the file
 * @returns Promise resolving when file is written
 */
export async function writeFileContent(filePath: string, content: string): Promise<void> {
	try {
		const fileUri = vscode.Uri.file(filePath)
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content))
	} catch (error) {
		throw new ClaudeCodeFileOperationError(
			`Failed to write file: ${filePath}`,
			filePath,
			"writeFile",
			error instanceof Error ? error : new Error(String(error)),
		)
	}
}

/**
 * Open a file in VS Code editor
 *
 * @param filePath - Path to the file to open
 * @param options - Optional settings for opening the file
 * @returns Promise resolving to the text editor
 */
export async function openFileInEditor(
	filePath: string,
	options: { preview?: boolean } = { preview: false },
): Promise<vscode.TextEditor> {
	try {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
		return await vscode.window.showTextDocument(document, options)
	} catch (error) {
		throw new ClaudeCodeVsCodeError(
			`Failed to open file in editor: ${filePath}`,
			"openTextDocument",
			error instanceof Error ? error : new Error(String(error)),
		)
	}
}

/**
 * Track file context with the file context tracker
 *
 * @param filePath - Path to the file to track
 * @param fileContextTracker - File context tracker
 * @param markAsEdited - Whether to mark the file as edited
 */
export function trackFileContext(
	filePath: string,
	fileContextTracker?: FileContextTracker,
	markAsEdited: boolean = true,
): void {
	if (!fileContextTracker) return

	fileContextTracker.trackFile(filePath)
	if (markAsEdited) {
		fileContextTracker.markFileAsEditedByRoo(filePath)
	}
}

/**
 * Create a file with the given content
 *
 * @param filePath - Path to the file to create
 * @param content - Content to write to the file
 * @param options - File operation options
 * @returns Promise resolving when file is created
 */
export async function createFile(filePath: string, content: string, options: FileOperationOptions): Promise<void> {
	// Use concurrency control to execute file operations in sequence
	return executeFileOperationInSequence(async () => {
		const { fileContextTracker, statusReporter, errorHandler, translationFunction } = options

		try {
			// Normalize and ensure directory exists
			const normalizedPath = normalizePath(filePath)
			const dirPath = path.dirname(normalizedPath)
			await ensureDirectoryExists(dirPath)

			// Write file content
			await writeFileContent(normalizedPath, content)

			// Open file in editor
			await openFileInEditor(normalizedPath)

			// Track file context
			trackFileContext(normalizedPath, fileContextTracker)

			// Show success message
			if (statusReporter?.showSuccess) {
				statusReporter.showSuccess(
					translationFunction("claudeCode.info.fileCreated", "Created file: {path}", {
						path: normalizedPath,
					}),
				)
			}
		} catch (error) {
			const originalError = error instanceof Error ? error : new Error(String(error))
			const wrappedError = new ClaudeCodeFileOperationError(
				translationFunction("claudeCode.error.createFailed", "Failed to create file {path}", {
					path: filePath,
				}),
				filePath,
				"create",
				originalError,
			)

			errorHandler(wrappedError)
			throw wrappedError
		}
	})
}

/**
 * Update a file with the given content
 *
 * @param filePath - Path to the file to update
 * @param content - New content for the file
 * @param options - File operation options
 * @returns Promise resolving when file is updated
 */
export async function updateFile(filePath: string, content: string, options: FileOperationOptions): Promise<void> {
	// Use concurrency control to execute file operations in sequence
	return executeFileOperationInSequence(async () => {
		const { diffViewProvider, fileContextTracker, statusReporter, errorHandler, translationFunction } = options

		try {
			// Normalize path
			const normalizedPath = normalizePath(filePath)

			let currentContent = ""

			try {
				// Read current content
				currentContent = await readFileContent(normalizedPath)
			} catch (error) {
				// File doesn't exist, treat as create
				return createFile(normalizedPath, content, options)
			}

			// If content is the same, no need to update
			if (currentContent === content) {
				return
			}

			// Use diff view if available
			if (diffViewProvider) {
				const approved = await diffViewProvider.showDiff(normalizedPath, currentContent, content)

				if (!approved) {
					if (statusReporter?.showInfo) {
						statusReporter.showInfo(
							translationFunction("claudeCode.info.updateRejected", "Update to {path} was rejected", {
								path: normalizedPath,
							}),
						)
					}
					return
				}
			}

			// Write updated content
			await writeFileContent(normalizedPath, content)

			// Open file in editor
			await openFileInEditor(normalizedPath)

			// Track file context
			trackFileContext(normalizedPath, fileContextTracker)

			// Show success message
			if (statusReporter?.showSuccess) {
				statusReporter.showSuccess(
					translationFunction("claudeCode.info.fileUpdated", "Updated file: {path}", {
						path: normalizedPath,
					}),
				)
			}
		} catch (error) {
			const originalError = error instanceof Error ? error : new Error(String(error))
			const wrappedError = new ClaudeCodeFileOperationError(
				translationFunction("claudeCode.error.updateFailed", "Failed to update file {path}", {
					path: filePath,
				}),
				filePath,
				"update",
				originalError,
			)

			errorHandler(wrappedError)
			throw wrappedError
		}
	})
}

/**
 * Delete a file with confirmation
 *
 * @param filePath - Path to the file to delete
 * @param options - File operation options
 * @param openedTabs - Set of opened tabs to update
 * @returns Promise resolving when file is deleted
 */
export async function deleteFile(
	filePath: string,
	options: FileOperationOptions,
	openedTabs?: Set<string>,
): Promise<void> {
	// Use concurrency control to execute file operations in sequence
	return executeFileOperationInSequence(async () => {
		const { statusReporter, errorHandler, translationFunction } = options

		try {
			// Normalize path
			const normalizedPath = normalizePath(filePath)

			// Confirm deletion
			const confirmed = await vscode.window.showWarningMessage(
				translationFunction("claudeCode.warning.confirmDelete", "Are you sure you want to delete {path}?", {
					path: normalizedPath,
				}),
				{ modal: true },
				translationFunction("claudeCode.button.delete", "Delete"),
			)

			if (confirmed !== translationFunction("claudeCode.button.delete", "Delete")) {
				return
			}

			// Delete file
			const fileUri = vscode.Uri.file(normalizedPath)
			await vscode.workspace.fs.delete(fileUri)

			// Update opened tabs tracking
			if (openedTabs) {
				openedTabs.delete(normalizedPath)
			}

			// Show success message
			if (statusReporter?.showSuccess) {
				statusReporter.showSuccess(
					translationFunction("claudeCode.info.fileDeleted", "Deleted file: {path}", {
						path: normalizedPath,
					}),
				)
			}
		} catch (error) {
			const originalError = error instanceof Error ? error : new Error(String(error))
			const wrappedError = new ClaudeCodeFileOperationError(
				translationFunction("claudeCode.error.deleteFailed", "Failed to delete file {path}", {
					path: filePath,
				}),
				filePath,
				"delete",
				originalError,
			)

			errorHandler(wrappedError)
			throw wrappedError
		}
	})
}

/**
 * Rename a file
 *
 * @param oldPath - Current path of the file
 * @param newPath - New path for the file
 * @param options - File operation options
 * @param openedTabs - Set of opened tabs to update
 * @returns Promise resolving when file is renamed
 */
export async function renameFile(
	oldPath: string,
	newPath: string,
	options: FileOperationOptions,
	openedTabs?: Set<string>,
): Promise<void> {
	// Use concurrency control to execute file operations in sequence
	return executeFileOperationInSequence(async () => {
		const { fileContextTracker, statusReporter, errorHandler, translationFunction } = options

		try {
			// Normalize paths
			const normalizedOldPath = normalizePath(oldPath)
			const normalizedNewPath = normalizePath(newPath)

			// Ensure target directory exists
			const dirPath = path.dirname(normalizedNewPath)
			await ensureDirectoryExists(dirPath)

			// Rename file
			const oldUri = vscode.Uri.file(normalizedOldPath)
			const newUri = vscode.Uri.file(normalizedNewPath)
			await vscode.workspace.fs.rename(oldUri, newUri)

			// Open new file in editor
			await openFileInEditor(normalizedNewPath)

			// Track file context
			trackFileContext(normalizedNewPath, fileContextTracker)

			// Update opened tabs tracking
			if (openedTabs) {
				openedTabs.delete(normalizedOldPath)
			}

			// Show success message
			if (statusReporter?.showSuccess) {
				statusReporter.showSuccess(
					translationFunction("claudeCode.info.fileRenamed", "Renamed file: {oldPath} to {newPath}", {
						oldPath: normalizedOldPath,
						newPath: normalizedNewPath,
					}),
				)
			}
		} catch (error) {
			const originalError = error instanceof Error ? error : new Error(String(error))
			const wrappedError = new ClaudeCodeFileOperationError(
				translationFunction("claudeCode.error.renameFailed", "Failed to rename file {oldPath} to {newPath}", {
					oldPath,
					newPath,
				}),
				`${oldPath} -> ${newPath}`,
				"rename",
				originalError,
			)

			errorHandler(wrappedError)
			throw wrappedError
		}
	})
}
