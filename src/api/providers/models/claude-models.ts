/**
 * Centralized model definitions for Claude models
 * This file serves as the single source of truth for Claude model information
 * across all providers (API, CLI, VS Code integration)
 */

import { ModelInfo } from "../../../shared/api"

/**
 * Base interface for Claude model information
 */
export interface ClaudeModelInfo extends ModelInfo {
	/** Input price per million tokens in USD */
	inputPrice: number

	/** Output price per million tokens in USD */
	outputPrice: number

	/** Whether the model supports thinking capability (Claude 3.7+) */
	thinking?: boolean
}

/**
 * Map of Claude model IDs to their information
 */
export type ClaudeModelsMap = {
	[key: string]: ClaudeModelInfo
}

/**
 * Default Claude model specifications as a centralized configuration
 * Shared across all Claude providers (API, CLI, VS Code integration)
 */
export const CLAUDE_MODELS: ClaudeModelsMap = {
	"claude-3-opus-20240229": {
		maxTokens: 4096,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsComputerUse: true,
		inputPrice: 15,
		outputPrice: 75,
		description: "Claude 3 Opus - The most powerful Claude model",
	},
	"claude-3-sonnet-20240229": {
		maxTokens: 4096,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsComputerUse: true,
		inputPrice: 3,
		outputPrice: 15,
		description: "Claude 3 Sonnet - Balance of intelligence and speed",
	},
	"claude-3-haiku-20240307": {
		maxTokens: 4096,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsComputerUse: true,
		inputPrice: 0.25,
		outputPrice: 1.25,
		description: "Claude 3 Haiku - Fastest Claude model",
	},
	"claude-3-5-sonnet-20240620": {
		maxTokens: 4096,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsComputerUse: true,
		inputPrice: 3,
		outputPrice: 15,
		description: "Claude 3.5 Sonnet - More capable and faster",
	},
	"claude-3-7-sonnet-20250219": {
		maxTokens: 4096,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsComputerUse: true,
		thinking: true,
		inputPrice: 3,
		outputPrice: 15,
		description: "Claude 3.7 Sonnet - With thinking capability",
	},
}

/**
 * Get a Claude model by ID
 * @param modelId The model ID to look up
 * @returns The model info or null if not found
 */
export function getClaudeModel(modelId: string): ClaudeModelInfo | null {
	return CLAUDE_MODELS[modelId] || null
}

/**
 * Get default Claude model ID
 * @returns The default Claude model ID
 */
export function getDefaultClaudeModelId(): string {
	return "claude-3-sonnet-20240229"
}

/**
 * Fallback model info for when a specific model is not found
 */
export const CLAUDE_FALLBACK_MODEL: ClaudeModelInfo = {
	maxTokens: 4096,
	contextWindow: 200000,
	supportsImages: true,
	supportsPromptCache: false,
	supportsComputerUse: true,
	inputPrice: 3,
	outputPrice: 15,
	description: "Claude model",
}

/**
 * Check if a model ID is for a thinking-capable model (Claude 3.7+)
 * @param modelId The model ID to check
 * @returns True if the model supports thinking, false otherwise
 */
export function supportsThinking(modelId: string): boolean {
	const model = CLAUDE_MODELS[modelId]
	return model?.thinking === true
}
