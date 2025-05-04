/**
 * Type definitions for Claude Code models and API responses
 */
import { ClaudeModelInfo, ClaudeModelsMap } from "./claude-models"

/**
 * Re-export the base Claude model info type as Claude Code model info
 */
export type ClaudeCodeModelInfo = ClaudeModelInfo

/**
 * Re-export the base Claude models map type as Claude Code models map
 */
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

	/** Command execution timeout in milliseconds (default: 60000ms) */
	commandTimeout?: number

	/** Authentication check timeout in milliseconds (default: 5000ms) */
	authCheckTimeout?: number
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
