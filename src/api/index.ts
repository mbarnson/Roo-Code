import { Anthropic } from "@anthropic-ai/sdk"
import { BetaThinkingConfigParam } from "@anthropic-ai/sdk/resources/beta/messages/index.mjs"
import * as vscode from "vscode"

import { ApiConfiguration, ModelInfo, ApiHandlerOptions } from "../shared/api"
import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./providers/constants"
import { GlamaHandler } from "./providers/glama"
import { AnthropicHandler } from "./providers/anthropic"
import { AwsBedrockHandler } from "./providers/bedrock"
import { OpenRouterHandler } from "./providers/openrouter"
import { VertexHandler } from "./providers/vertex"
import { AnthropicVertexHandler } from "./providers/anthropic-vertex"
import { OpenAiHandler } from "./providers/openai"
import { OllamaHandler } from "./providers/ollama"
import { LmStudioHandler } from "./providers/lmstudio"
import { GeminiHandler } from "./providers/gemini"
import { OpenAiNativeHandler } from "./providers/openai-native"
import { DeepSeekHandler } from "./providers/deepseek"
import { MistralHandler } from "./providers/mistral"
import { VsCodeLmHandler } from "./providers/vscode-lm"
import { ApiStream } from "./transform/stream"
import { UnboundHandler } from "./providers/unbound"
import { RequestyHandler } from "./providers/requesty"
import { HumanRelayHandler } from "./providers/human-relay"
import { FakeAIHandler } from "./providers/fake-ai"
import { XAIHandler } from "./providers/xai"
import { ClaudeCodeHandler } from "./providers/claude-code"
import { ClaudeCodeCommandOptions } from "./providers/models/claude-code-models"
import { createVsCodeIntegratedClaudeCode } from "./providers/claude-code-vscode-integrated"
import { VsCodeIntegratedClaudeCodeOptions } from "./providers/models/claude-code-vscode-types"
import { DiffViewProvider } from "../integrations/editor/DiffViewProvider"
import { ClineProvider } from "../core/webview/ClineProvider"
import { createFileContextTracker } from "./providers/models/cline-provider-types"

export interface SingleCompletionHandler {
	completePrompt(prompt: string): Promise<string>
}

export interface ApiHandler {
	createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[], cacheKey?: string): ApiStream

	getModel(): { id: string; info: ModelInfo }

	/**
	 * Counts tokens for content blocks
	 * All providers extend BaseProvider which provides a default tiktoken implementation,
	 * but they can override this to use their native token counting endpoints
	 *
	 * @param content The content to count tokens for
	 * @returns A promise resolving to the token count
	 */
	countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number>
}

export function buildApiHandler(configuration: ApiConfiguration, clineProvider?: ClineProvider): ApiHandler {
	const { apiProvider, ...options } = configuration

	switch (apiProvider) {
		case "anthropic":
			return new AnthropicHandler(options)
		case "glama":
			return new GlamaHandler(options)
		case "openrouter":
			return new OpenRouterHandler(options)
		case "bedrock":
			return new AwsBedrockHandler(options)
		case "vertex":
			if (options.apiModelId?.startsWith("claude")) {
				return new AnthropicVertexHandler(options)
			} else {
				return new VertexHandler(options)
			}
		case "openai":
			return new OpenAiHandler(options)
		case "ollama":
			return new OllamaHandler(options)
		case "lmstudio":
			return new LmStudioHandler(options)
		case "gemini":
			return new GeminiHandler(options)
		case "openai-native":
			return new OpenAiNativeHandler(options)
		case "deepseek":
			return new DeepSeekHandler(options)
		case "vscode-lm":
			return new VsCodeLmHandler(options)
		case "mistral":
			return new MistralHandler(options)
		case "unbound":
			return new UnboundHandler(options)
		case "requesty":
			return new RequestyHandler(options)
		case "human-relay":
			return new HumanRelayHandler()
		case "fake-ai":
			return new FakeAIHandler(options)
		case "xai":
			return new XAIHandler(options)
		case "claude-code":
			// Create Claude Code command options with proper type safety
			const claudeCodeOptions: ClaudeCodeCommandOptions = {
				claudeCodePath: options.claudeCodePath,
				claudeCodeModelId: options.claudeCodeModelId,
				modelTemperature: options.modelTemperature === null ? undefined : options.modelTemperature,
				includeMaxTokens: options.includeMaxTokens,
				modelMaxTokens: options.modelMaxTokens,
				modelMaxThinkingTokens: options.modelMaxThinkingTokens,
				reasoningEffort: options.reasoningEffort,
			}

			// If VS Code integration is possible (clineProvider is available), use the VS Code integrated handler
			if (clineProvider) {
				const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ""

				// Create the diff view provider
				const diffViewProvider = new DiffViewProvider(cwd)

				// Create file context tracker safely
				const fileContextTracker = createFileContextTracker(clineProvider)

				// Only use VS Code integration if fileContextTracker is available
				if (fileContextTracker) {
					// Create the VS Code integration options
					const vsCodeOptions: VsCodeIntegratedClaudeCodeOptions = {
						...claudeCodeOptions,
						claudeCodeVsCodeIntegration: true,
						claudeCodeFileTracking: true,
						claudeCodeShowDiffViews: true,
						cwd,
					}

					// Create and return the VS Code integrated handler
					return createVsCodeIntegratedClaudeCode(vsCodeOptions, diffViewProvider, fileContextTracker)
				}
			}

			// Fall back to direct ClaudeCodeHandler if VS Code integration is not possible
			return new ClaudeCodeHandler(claudeCodeOptions)
		default:
			return new AnthropicHandler(options)
	}
}

/**
 * Model parameters configuration
 */
export interface ModelParameters {
	maxTokens?: number
	thinking?: BetaThinkingConfigParam
	temperature: number
	reasoningEffort?: "low" | "medium" | "high"
}

/**
 * Get model parameters based on model info and options
 */
export function getModelParams({
	options,
	model,
	defaultMaxTokens,
	defaultTemperature = 0,
	defaultReasoningEffort,
}: {
	options: ApiHandlerOptions
	model: ModelInfo
	defaultMaxTokens?: number
	defaultTemperature?: number
	defaultReasoningEffort?: "low" | "medium" | "high"
}): ModelParameters {
	// Extract options with safe default values
	const {
		modelMaxTokens: customMaxTokens,
		modelMaxThinkingTokens: customMaxThinkingTokens,
		modelTemperature: customTemperature,
		reasoningEffort: customReasoningEffort,
	} = options

	// Initialize with defaults and non-null values
	let maxTokens = model.maxTokens ?? defaultMaxTokens
	let thinking: BetaThinkingConfigParam | undefined = undefined
	let temperature = customTemperature ?? defaultTemperature
	const reasoningEffort = customReasoningEffort ?? defaultReasoningEffort

	// Handle thinking models (Claude 3.7+)
	if (model.thinking === true) {
		// Only honor `customMaxTokens` for thinking models.
		maxTokens = customMaxTokens ?? maxTokens

		// Use a safe default for max tokens if still undefined
		const effectiveMaxTokens = maxTokens || ANTHROPIC_DEFAULT_MAX_TOKENS

		// Clamp the thinking budget to be at most 80% of max tokens and at
		// least 1024 tokens.
		const maxBudgetTokens = Math.floor(effectiveMaxTokens * 0.8)

		// Safely determine the budget tokens
		const defaultBudget = maxBudgetTokens
		const requestedBudget = customMaxThinkingTokens ?? defaultBudget
		const clampedBudget = Math.min(requestedBudget, maxBudgetTokens)
		const finalBudget = Math.max(clampedBudget, 1024)

		thinking = {
			type: "enabled",
			budget_tokens: finalBudget,
		}

		// Anthropic "Thinking" models require a temperature of 1.0.
		temperature = 1.0
	}

	return { maxTokens, thinking, temperature, reasoningEffort }
}
