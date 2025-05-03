/**
 * Common type definitions for Claude Code VS Code integration
 */

/**
 * Response from a completion operation
 */
export interface CompletionResponse {
  content: string;
}

/**
 * Options for a prompt completion
 */
export interface PromptOptions {
  prompt: string;
  includeThinking?: boolean;
  systemPrompt?: string;
}

/**
 * Base provider options interface
 */
export interface ProviderOptions {
  [key: string]: any;
}