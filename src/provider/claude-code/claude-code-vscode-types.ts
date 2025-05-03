/**
 * Type definitions for Claude Code VS Code integration
 */

/**
 * Configuration options for the VS Code integrated Claude Code provider
 */
export interface VsCodeIntegratedClaudeCodeOptions {
  /** Path to Claude Code CLI executable */
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