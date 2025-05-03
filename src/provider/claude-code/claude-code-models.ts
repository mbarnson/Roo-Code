/**
 * Type definitions for Claude Code models and API responses
 */

/**
 * Structured information about a Claude Code model
 */
export interface ClaudeCodeModelInfo {
  /** Maximum output tokens allowed */
  maxTokens: number

  /** Maximum context window size in tokens */
  contextWindow: number

  /** Whether the model supports image inputs */
  supportsImages: boolean

  /** Whether the model supports prompt caching */
  supportsPromptCache: boolean

  /** Whether the model supports computer use/tool use */
  supportsComputerUse: boolean

  /** Whether the model supports thinking mode (Claude 3.7+) */
  thinking?: boolean

  /** Input price per million tokens in USD */
  inputPrice: number

  /** Output price per million tokens in USD */
  outputPrice: number

  /** Human-readable description of the model */
  description: string
}

/**
 * Map of Claude Code model IDs to their information
 */
export type ClaudeCodeModelsMap = {
  [key: string]: ClaudeCodeModelInfo
}

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