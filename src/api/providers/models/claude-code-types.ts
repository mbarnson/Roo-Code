/**
 * Consolidated type definitions for Claude Code
 *
 * This file serves as the single source of truth for all Claude Code related types.
 */

// Import the base Claude model definitions
import { ClaudeModelInfo, ClaudeModelsMap } from "./claude-models"

// Re-export the base Claude types with Claude Code naming for backward compatibility
export type ClaudeCodeModelInfo = ClaudeModelInfo
export type ClaudeCodeModelsMap = ClaudeModelsMap

/**
 * Authentication status response from Claude Code CLI
 */
export interface ClaudeCodeAuthStatus {
	/** Whether the user is authenticated */
	authenticated: boolean

	/** Optional error message if authentication failed */
	error?: string
}

/**
 * Claude Code CLI options for chat and complete commands
 */
export interface ClaudeCodeCommandOptions {
	/** Path to the Claude Code CLI executable */
	claudeCodePath?: string

	/** Model ID to use */
	claudeCodeModelId?: string

	/** Temperature setting (0-1) */
	modelTemperature?: number

	/** Whether to include max tokens parameter */
	includeMaxTokens?: boolean

	/** Maximum tokens for completion */
	modelMaxTokens?: number

	/** Maximum thinking tokens budget (for Claude 3.7+) */
	modelMaxThinkingTokens?: number

	/** Reasoning effort setting */
	reasoningEffort?: "low" | "medium" | "high"
}

/**
 * Structure for input to Claude Code chat command
 */
export interface ClaudeCodeChatInput {
	/** System prompt */
	system: string

	/** Array of message objects */
	messages: Array<{
		/** Message role (user/assistant) */
		role: string

		/** Message content */
		content: string
	}>
}

/**
 * XML Matcher processed chunk
 */
export interface XmlMatchedChunk {
	/** Whether the chunk matched the XML tag */
	matched: boolean

	/** The content data */
	data: string
}

/**
 * Configuration options for the VS Code integrated Claude Code provider
 * Extends the base command options with VS Code specific options
 */
export interface VsCodeIntegratedClaudeCodeOptions extends ClaudeCodeCommandOptions {
	/** Whether to use VS Code integration features */
	claudeCodeVsCodeIntegration?: boolean

	/** Whether to track file mentions and modifications */
	claudeCodeFileTracking?: boolean

	/** Whether to show diff views for file modifications */
	claudeCodeShowDiffViews?: boolean

	/** Current working directory for file paths */
	cwd?: string
}

/**
 * File modification mapping type
 */
export type FileModificationsMap = Map<string, string>

/**
 * Error formatting operation type
 */
export type ErrorFormattingOperation = "message generation" | "completion" | "file modification" | "file reading"

/**
 * Response type for progress indicator management
 */
export type ProgressResolver = () => void

/**
 * Detected file modification result
 */
export interface DetectedFileModification {
	/** Absolute path to the file */
	absolutePath: string

	/** Whether the file exists */
	exists: boolean

	/** Original file content (if exists) */
	content?: string
}

/**
 * Status reporter interface for VS Code integration
 * This is a temporary placeholder until the real StatusReporter is implemented
 */
export interface StatusReporter {
	/** Show info message */
	showInfo(message: string): void

	/** Show error message */
	showError(message: string, error?: Error): void

	/** Show warning message */
	showWarning(message: string): void

	/** Show progress */
	showProgress(message: string): Promise<ProgressResolver>

	/** Hide progress */
	hideProgress(): void

	/** Update status */
	updateStatus(status: string): void

	/** Report status - renamed version of updateStatus used in some implementations */
	reportStatus(status: string | { status: string; message: string; provider: string }): void
}
