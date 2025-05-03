import {
	ApiProvider,
	ModelInfo,
	anthropicModels,
	bedrockModels,
	deepSeekModels,
	geminiModels,
	mistralModels,
	openAiNativeModels,
	vertexModels,
	xaiModels,
} from "@roo/shared/api"

export { REASONING_MODELS, PROMPT_CACHING_MODELS } from "@roo/shared/api"

export { AWS_REGIONS } from "@roo/shared/aws_regions"

// Define Claude Code models
export const claudeCodeModels: Record<string, ModelInfo> = {
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

export const MODELS_BY_PROVIDER: Partial<Record<ApiProvider, Record<string, ModelInfo>>> = {
	anthropic: anthropicModels,
	bedrock: bedrockModels,
	deepseek: deepSeekModels,
	gemini: geminiModels,
	mistral: mistralModels,
	"openai-native": openAiNativeModels,
	vertex: vertexModels,
	xai: xaiModels,
	"claude-code": claudeCodeModels,
}

export const PROVIDERS = [
	{ value: "openrouter", label: "OpenRouter" },
	{ value: "anthropic", label: "Anthropic" },
	{ value: "gemini", label: "Google Gemini" },
	{ value: "deepseek", label: "DeepSeek" },
	{ value: "openai-native", label: "OpenAI" },
	{ value: "openai", label: "OpenAI Compatible" },
	{ value: "vertex", label: "GCP Vertex AI" },
	{ value: "bedrock", label: "Amazon Bedrock" },
	{ value: "glama", label: "Glama" },
	{ value: "vscode-lm", label: "VS Code LM API" },
	{ value: "mistral", label: "Mistral" },
	{ value: "lmstudio", label: "LM Studio" },
	{ value: "ollama", label: "Ollama" },
	{ value: "unbound", label: "Unbound" },
	{ value: "requesty", label: "Requesty" },
	{ value: "human-relay", label: "Human Relay" },
	{ value: "xai", label: "xAI" },
	{ value: "claude-code", label: "Claude Code CLI" },
].sort((a, b) => a.label.localeCompare(b.label))

export const VERTEX_REGIONS = [
	{ value: "us-east5", label: "us-east5" },
	{ value: "us-central1", label: "us-central1" },
	{ value: "europe-west1", label: "europe-west1" },
	{ value: "europe-west4", label: "europe-west4" },
	{ value: "asia-southeast1", label: "asia-southeast1" },
]
