import React, { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useDebounce, useEvent } from "react-use"
import { Trans } from "react-i18next"
import { LanguageModelChatSelector } from "vscode"
import { Checkbox } from "vscrui"
import {
	VSCodeButton,
	VSCodeLink,
	VSCodeRadio,
	VSCodeRadioGroup,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"
import { ExternalLinkIcon } from "@radix-ui/react-icons"

import { ReasoningEffort as ReasoningEffortType } from "@roo/schemas"
import {
	ApiConfiguration,
	ModelInfo,
	azureOpenAiDefaultApiVersion,
	glamaDefaultModelId,
	mistralDefaultModelId,
	openAiModelInfoSaneDefaults,
	openRouterDefaultModelId,
	unboundDefaultModelId,
	requestyDefaultModelId,
	ApiProvider,
} from "@roo/shared/api"
import { ExtensionMessage } from "@roo/shared/ExtensionMessage"

import { vscode } from "@src/utils/vscode"
import { validateApiConfiguration, validateModelId, validateBedrockArn } from "@src/utils/validate"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useRouterModels } from "@src/components/ui/hooks/useRouterModels"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"
import {
	useOpenRouterModelProviders,
	OPENROUTER_DEFAULT_PROVIDER_NAME,
} from "@src/components/ui/hooks/useOpenRouterModelProviders"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button } from "@src/components/ui"
import { getRequestyAuthUrl, getOpenRouterAuthUrl, getGlamaAuthUrl } from "@src/oauth/urls"

import { VSCodeButtonLink } from "../common/VSCodeButtonLink"

import { MODELS_BY_PROVIDER, PROVIDERS, VERTEX_REGIONS, REASONING_MODELS, AWS_REGIONS, claudeCodeModels } from "./constants"
import { ModelInfoView } from "./ModelInfoView"
import { ModelPicker } from "./ModelPicker"
import { ApiErrorMessage } from "./ApiErrorMessage"
import { ThinkingBudget } from "./ThinkingBudget"
import { R1FormatSetting } from "./R1FormatSetting"
import { OpenRouterBalanceDisplay } from "./OpenRouterBalanceDisplay"
import { RequestyBalanceDisplay } from "./RequestyBalanceDisplay"
import { ReasoningEffort } from "./ReasoningEffort"
import { PromptCachingControl } from "./PromptCachingControl"
import { DiffSettingsControl } from "./DiffSettingsControl"
import { TemperatureControl } from "./TemperatureControl"
import { RateLimitSecondsControl } from "./RateLimitSecondsControl"

export interface ApiOptionsProps {
	uriScheme: string | undefined
	apiConfiguration: ApiConfiguration
	setApiConfigurationField: <K extends keyof ApiConfiguration>(field: K, value: ApiConfiguration[K]) => void
	fromWelcomeView?: boolean
	errorMessage: string | undefined
	setErrorMessage: React.Dispatch<React.SetStateAction<string | undefined>>
}

const ApiOptions = ({
	uriScheme,
	apiConfiguration,
	setApiConfigurationField,
	fromWelcomeView,
	errorMessage,
	setErrorMessage,
}: ApiOptionsProps) => {
	const { t } = useAppTranslation()

	const [ollamaModels, setOllamaModels] = useState<string[]>([])
	const [lmStudioModels, setLmStudioModels] = useState<string[]>([])
	const [vsCodeLmModels, setVsCodeLmModels] = useState<LanguageModelChatSelector[]>([])

	const [openAiModels, setOpenAiModels] = useState<Record<string, ModelInfo> | null>(null)

	const [customHeaders, setCustomHeaders] = useState<[string, string][]>(() => {
		const headers = apiConfiguration?.openAiHeaders || {}
		return Object.entries(headers)
	})

	// Effect to synchronize internal customHeaders state with prop changes
	useEffect(() => {
		const propHeaders = apiConfiguration?.openAiHeaders || {}
		if (JSON.stringify(customHeaders) !== JSON.stringify(Object.entries(propHeaders))) setCustomHeaders(Object.entries(propHeaders))
	}, [apiConfiguration?.openAiHeaders])

	const [anthropicBaseUrlSelected, setAnthropicBaseUrlSelected] = useState(!!apiConfiguration?.anthropicBaseUrl)
	const [openAiNativeBaseUrlSelected, setOpenAiNativeBaseUrlSelected] = useState(
		!!apiConfiguration?.openAiNativeBaseUrl,
	)
	const [azureApiVersionSelected, setAzureApiVersionSelected] = useState(!!apiConfiguration?.azureApiVersion)
	const [openRouterBaseUrlSelected, setOpenRouterBaseUrlSelected] = useState(!!apiConfiguration?.openRouterBaseUrl)
	const [openAiLegacyFormatSelected, setOpenAiLegacyFormatSelected] = useState(!!apiConfiguration?.openAiLegacyFormat)
	const [googleGeminiBaseUrlSelected, setGoogleGeminiBaseUrlSelected] = useState(
		!!apiConfiguration?.googleGeminiBaseUrl,
	)

	const handleAddCustomHeader = useCallback(() => {
		// Only update the local state to show the new row in the UI
		setCustomHeaders((prev) => [...prev, ["", ""]])
		// Do not update the main configuration yet, wait for user input
	}, [])

	const handleUpdateHeaderKey = useCallback((index: number, newKey: string) => {
		setCustomHeaders((prev) => {
			const updated = [...prev]
			if (updated[index]) {
				updated[index] = [newKey, updated[index][1]]
			}
			return updated
		})
	}, [])

	const handleUpdateHeaderValue = useCallback((index: number, newValue: string) => {
		setCustomHeaders((prev) => {
			const updated = [...prev]
			if (updated[index]) {
				updated[index] = [updated[index][0], newValue]
			}
			return updated
		})
	}, [])

	const handleRemoveCustomHeader = useCallback((index: number) => {
		setCustomHeaders((prev) => prev.filter((_, i) => i !== index))
	}, [])

	// Helper to convert array of tuples to object (filtering out empty keys)
	const convertHeadersToObject = (headers: [string, string][]): Record<string, string> => {
		const result: Record<string, string> = {}

		// Process each header tuple
		for (const [key, value] of headers) {
			const trimmedKey = key.trim()

			// Skip empty keys
			if (!trimmedKey) continue

			// For duplicates, the last one in the array wins
			// This matches how HTTP headers work in general
			result[trimmedKey] = value.trim()
		}

		return result
	}

	// Debounced effect to update the main configuration when local customHeaders state stabilizes
	useDebounce(
		() => {
			const currentConfigHeaders = apiConfiguration?.openAiHeaders || {}
			const newHeadersObject = convertHeadersToObject(customHeaders)

			// Only update if the processed object is different from the current config
			if (JSON.stringify(currentConfigHeaders) !== JSON.stringify(newHeadersObject)) {
				setApiConfigurationField("openAiHeaders", newHeadersObject)
			}
		},
		300,
		[customHeaders, apiConfiguration?.openAiHeaders, setApiConfigurationField],
	)

	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
	const noTransform = <T,>(value: T) => value

	const inputEventTransform = <E,>(event: E) => (event as { target: HTMLInputElement })?.target?.value as any

	const handleInputChange = useCallback(
		<K extends keyof ApiConfiguration, E>(
			field: K,
			transform: (event: E) => ApiConfiguration[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const {
		provider: selectedProvider,
		id: selectedModelId,
		info: selectedModelInfo,
	} = useSelectedModel(apiConfiguration)

	const { data: routerModels } = useRouterModels()

	// Update apiConfiguration.aiModelId whenever selectedModelId changes.
	useEffect(() => {
		if (selectedModelId) {
			setApiConfigurationField("apiModelId", selectedModelId)
		}
	}, [selectedModelId, setApiConfigurationField])

	// Debounced refresh model updates, only executed 250ms after the user
	// stops typing.
	useDebounce(
		() => {
			if (selectedProvider === "openai") {
				// Use our custom headers state to build the headers object
				const headerObject = convertHeadersToObject(customHeaders)
				vscode.postMessage({
					type: "requestOpenAiModels",
					values: {
						baseUrl: apiConfiguration?.openAiBaseUrl,
						apiKey: apiConfiguration?.openAiApiKey,
						customHeaders: {}, // Reserved for any additional headers
						openAiHeaders: headerObject,
					},
				})
			} else if (selectedProvider === "ollama") {
				vscode.postMessage({ type: "requestOllamaModels", text: apiConfiguration?.ollamaBaseUrl })
			} else if (selectedProvider === "lmstudio") {
				vscode.postMessage({ type: "requestLmStudioModels", text: apiConfiguration?.lmStudioBaseUrl })
			} else if (selectedProvider === "vscode-lm") {
				vscode.postMessage({ type: "requestVsCodeLmModels" })
			}
		},
		250,
		[
			selectedProvider,
			apiConfiguration?.requestyApiKey,
			apiConfiguration?.openAiBaseUrl,
			apiConfiguration?.openAiApiKey,
			apiConfiguration?.ollamaBaseUrl,
			apiConfiguration?.lmStudioBaseUrl,
			customHeaders,
		],
	)

	useEffect(() => {
		const apiValidationResult =
			validateApiConfiguration(apiConfiguration) || validateModelId(apiConfiguration, routerModels)
		setErrorMessage(apiValidationResult)
	}, [apiConfiguration, routerModels, setErrorMessage])

	const { data: openRouterModelProviders } = useOpenRouterModelProviders(apiConfiguration?.openRouterModelId, {
		enabled:
			selectedProvider === "openrouter" &&
			!!apiConfiguration?.openRouterModelId &&
			routerModels?.openrouter &&
			Object.keys(routerModels.openrouter).length > 1 &&
			apiConfiguration.openRouterModelId in routerModels.openrouter,
	})

	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data

		switch (message.type) {
			case "openAiModels": {
				const updatedModels = message.openAiModels ?? []
				setOpenAiModels(Object.fromEntries(updatedModels.map((item) => [item, openAiModelInfoSaneDefaults])))
				break
			}
			case "ollamaModels":
				{
					const newModels = message.ollamaModels ?? []
					setOllamaModels(newModels)
				}
				break
			case "lmStudioModels":
				{
					const newModels = message.lmStudioModels ?? []
					setLmStudioModels(newModels)
				}
				break
			case "vsCodeLmModels":
				{
					const newModels = message.vsCodeLmModels ?? []
					setVsCodeLmModels(newModels)
				}
				break
		}
	}, [])

	useEvent("message", onMessage)

	const selectedProviderModelOptions = useMemo(
		() =>
			MODELS_BY_PROVIDER[selectedProvider]
				? Object.keys(MODELS_BY_PROVIDER[selectedProvider]).map((modelId) => ({
						value: modelId,
						label: modelId,
					}))
				: [],
		[selectedProvider],
	)

	// Base URL for provider documentation
	const DOC_BASE_URL = "https://docs.roocode.com/providers"

	// Custom URL path mappings for providers with different slugs
	const providerUrlSlugs: Record<string, string> = {
		"openai-native": "openai",
		openai: "openai-compatible",
	}

	// Helper function to get provider display name from PROVIDERS constant
	const getProviderDisplayName = (providerKey: string): string | undefined => {
		const provider = PROVIDERS.find((p) => p.value === providerKey)
		return provider?.label
	}

	// Helper function to get the documentation URL and name for the currently selected provider
	const getSelectedProviderDocUrl = (): { url: string; name: string } | undefined => {
		const displayName = getProviderDisplayName(selectedProvider)

		if (!displayName) {
			return undefined
		}

		// Get the URL slug - use custom mapping if available, otherwise use the provider key
		const urlSlug = providerUrlSlugs[selectedProvider] || selectedProvider

		return {
			url: `${DOC_BASE_URL}/${urlSlug}`,
			name: displayName,
		}
	}

	const onApiProviderChange = useCallback(
		(value: ApiProvider) => {
			// It would be much easier to have a single attribute that stores
			// the modelId, but we have a separate attribute for each of
			// OpenRouter, Glama, Unbound, and Requesty.
			// If you switch to one of these providers and the corresponding
			// modelId is not set then you immediately end up in an error state.
			// To address that we set the modelId to the default value for th
			// provider if it's not already set.
			switch (value) {
				case "openrouter":
					if (!apiConfiguration.openRouterModelId) {
						setApiConfigurationField("openRouterModelId", openRouterDefaultModelId)
					}
					break
				case "glama":
					if (!apiConfiguration.glamaModelId) {
						setApiConfigurationField("glamaModelId", glamaDefaultModelId)
					}
					break
				case "unbound":
					if (!apiConfiguration.unboundModelId) {
						setApiConfigurationField("unboundModelId", unboundDefaultModelId)
					}
					break
				case "requesty":
					if (!apiConfiguration.requestyModelId) {
						setApiConfigurationField("requestyModelId", requestyDefaultModelId)
					}
					break
			}

			setApiConfigurationField("apiProvider", value)
		},
		[
			setApiConfigurationField,
			apiConfiguration.openRouterModelId,
			apiConfiguration.glamaModelId,
			apiConfiguration.unboundModelId,
			apiConfiguration.requestyModelId,
		],
	)

	// Render the common provider selector UI
	const renderProviderSelector = () => (
		<div className="flex flex-col gap-1 relative">
			<div className="flex justify-between items-center">
				<label className="block font-medium mb-1">{t("settings:providers.apiProvider")}</label>
				{getSelectedProviderDocUrl() && (
					<div className="text-xs text-vscode-descriptionForeground">
						<VSCodeLink
							href={getSelectedProviderDocUrl()!.url}
							className="hover:text-vscode-foreground"
							target="_blank">
							{t("settings:providers.providerDocumentation", {
								provider: getSelectedProviderDocUrl()!.name,
							})}
						</VSCodeLink>
					</div>
				)}
			</div>
			<Select value={selectedProvider} onValueChange={(value) => onApiProviderChange(value as ApiProvider)}>
				<SelectTrigger className="w-full">
					<SelectValue placeholder={t("settings:common.select")} />
				</SelectTrigger>
				<SelectContent>
					{PROVIDERS.map(({ value, label }) => (
						<SelectItem key={value} value={value}>
							{label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);

	// Render Claude Code provider settings
	const renderClaudeCodeSettings = () => {
		if (selectedProvider !== "claude-code") return null;
		
		return (
			<>
				<VSCodeTextField
					value={apiConfiguration?.claudeCodePath || ""}
					onInput={handleInputChange("claudeCodePath")}
					placeholder="claude-code"
					className="w-full">
					<label className="block font-medium mb-1">{t("settings:providers.claudeCode.cliPath")}</label>
				</VSCodeTextField>
				<div className="text-sm text-vscode-descriptionForeground -mt-2">
					{t("settings:providers.claudeCode.cliPathDescription")}
				</div>
				
				<div 
					className="my-2 p-3 text-sm rounded"
					style={{
						backgroundColor: "var(--vscode-inputValidation-infoBackground)",
						color: "var(--vscode-inputValidation-infoForeground)",
						border: "1px solid var(--vscode-inputValidation-infoBorder)",
					}}>
					<div className="font-semibold mb-1">🔑 {t("settings:providers.claudeCode.authRequired")}</div>
					<p className="mb-2">{t("settings:providers.claudeCode.authInstructions")}</p>
					<ol className="list-decimal ml-5 mb-2">
						<li className="mb-1">{t("settings:providers.claudeCode.installCli")}{" "}
							<VSCodeLink href="https://claude.ai/code" className="text-sm font-medium">
								claude.ai/code
							</VSCodeLink>
						</li>
						<li className="mb-1">
							<Trans
								i18nKey="settings:providers.claudeCode.loginCommand"
								components={{
									code: <code className="px-1 py-0.5 rounded bg-opacity-30 bg-white"/>
								}}
							/>
						</li>
						<li>
							<Trans
								i18nKey="settings:providers.claudeCode.verifyCommand"
								components={{
									code: <code className="px-1 py-0.5 rounded bg-opacity-30 bg-white"/>
								}}
							/>
						</li>
					</ol>
					<p className="text-xs">{t("settings:providers.claudeCode.authNote")}</p>
				</div>
		        
		        <div className="mt-4">
		            <div className="flex flex-col gap-2">
		                <Checkbox
		                    checked={apiConfiguration?.claudeCodeVsCodeIntegration !== false}
		                    onChange={handleInputChange("claudeCodeVsCodeIntegration", noTransform)}>
		                    <div className="flex items-center gap-1">
		                        <span className="font-medium">{t("settings:providers.claudeCode.vsCodeIntegration")}</span>
		                        <i
		                            className="codicon codicon-info text-vscode-descriptionForeground"
		                            title={t("settings:providers.claudeCode.vsCodeIntegrationTooltip")}
		                            style={{ fontSize: "12px" }}
		                        />
		                    </div>
		                </Checkbox>
		            </div>
		            <div className="text-sm text-vscode-descriptionForeground mt-2">
		                {t("settings:providers.claudeCode.vsCodeIntegrationDescription")}
		            </div>
		        </div>

				<div>
					<label className="block font-medium mb-1">{t("settings:providers.model")}</label>
					<Select 
						value={apiConfiguration?.claudeCodeModelId || "claude-3-sonnet-20240229"}
						onValueChange={(value) => setApiConfigurationField("claudeCodeModelId", value)}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder={t("settings:common.select")} />
						</SelectTrigger>
						<SelectContent>
							{Object.keys(claudeCodeModels).map((modelId) => (
								<SelectItem key={modelId} value={modelId}>
									{modelId}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<ModelInfoView
					apiProvider={selectedProvider}
					selectedModelId={apiConfiguration?.claudeCodeModelId || "claude-3-sonnet-20240229"}
					modelInfo={claudeCodeModels[apiConfiguration?.claudeCodeModelId || "claude-3-sonnet-20240229"]}
					isDescriptionExpanded={isDescriptionExpanded}
					setIsDescriptionExpanded={setIsDescriptionExpanded}
				/>
				
				{(apiConfiguration?.claudeCodeModelId || "").includes("3-7") && (
					<ThinkingBudget
						key={`claude-code-${apiConfiguration?.claudeCodeModelId}`}
						apiConfiguration={apiConfiguration}
						setApiConfigurationField={setApiConfigurationField}
						modelInfo={claudeCodeModels[apiConfiguration?.claudeCodeModelId || "claude-3-7-sonnet-20250219"]}
					/>
				)}
			</>
		);
	};

	// Render Human Relay provider settings
	const renderHumanRelaySettings = () => {
		if (selectedProvider !== "human-relay") return null;
		
		return (
			<>
				<div className="text-sm text-vscode-descriptionForeground">
					{t("settings:providers.humanRelay.description")}
				</div>
				<div className="text-sm text-vscode-descriptionForeground">
					{t("settings:providers.humanRelay.instructions")}
				</div>
			</>
		);
	};

	// Render the common model pickers for OpenRouter, Glama, etc.
	const renderModelPickers = () => {
		return (
			<>
				{selectedProvider === "openrouter" && (
					<ModelPicker
						apiConfiguration={apiConfiguration}
						setApiConfigurationField={setApiConfigurationField}
						defaultModelId={openRouterDefaultModelId}
						models={routerModels?.openrouter ?? {}}
						modelIdKey="openRouterModelId"
						serviceName="OpenRouter"
						serviceUrl="https://openrouter.ai/models"
					/>
				)}

				{selectedProvider === "openrouter" &&
					openRouterModelProviders &&
					Object.keys(openRouterModelProviders).length > 0 && (
						<div>
							<div className="flex items-center gap-1">
								<label className="block font-medium mb-1">
									{t("settings:providers.openRouter.providerRouting.title")}
								</label>
								<a href={`https://openrouter.ai/${selectedModelId}/providers`}>
									<ExternalLinkIcon className="w-4 h-4" />
								</a>
							</div>
							<Select
								value={apiConfiguration?.openRouterSpecificProvider || OPENROUTER_DEFAULT_PROVIDER_NAME}
								onValueChange={(value) => setApiConfigurationField("openRouterSpecificProvider", value)}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder={t("settings:common.select")} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={OPENROUTER_DEFAULT_PROVIDER_NAME}>
										{OPENROUTER_DEFAULT_PROVIDER_NAME}
									</SelectItem>
									{Object.entries(openRouterModelProviders).map(([value, { label }]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<div className="text-sm text-vscode-descriptionForeground mt-1">
								{t("settings:providers.openRouter.providerRouting.description")}{" "}
								<a href="https://openrouter.ai/docs/features/provider-routing">
									{t("settings:providers.openRouter.providerRouting.learnMore")}.
								</a>
							</div>
						</div>
					)}

				{selectedProvider === "glama" && (
					<ModelPicker
						apiConfiguration={apiConfiguration}
						setApiConfigurationField={setApiConfigurationField}
						defaultModelId={glamaDefaultModelId}
						models={routerModels?.glama ?? {}}
						modelIdKey="glamaModelId"
						serviceName="Glama"
						serviceUrl="https://glama.ai/models"
					/>
				)}

				{selectedProvider === "unbound" && (
					<ModelPicker
						apiConfiguration={apiConfiguration}
						defaultModelId={unboundDefaultModelId}
						models={routerModels?.unbound ?? {}}
						modelIdKey="unboundModelId"
						serviceName="Unbound"
						serviceUrl="https://api.getunbound.ai/models"
						setApiConfigurationField={setApiConfigurationField}
					/>
				)}

				{selectedProvider === "requesty" && (
					<ModelPicker
						apiConfiguration={apiConfiguration}
						setApiConfigurationField={setApiConfigurationField}
						defaultModelId={requestyDefaultModelId}
						models={routerModels?.requesty ?? {}}
						modelIdKey="requestyModelId"
						serviceName="Requesty"
						serviceUrl="https://requesty.ai"
					/>
				)}
			</>
		);
	};

	// Render standard model options for providers that use the MODELS_BY_PROVIDER mapping
	const renderStandardModelOptions = () => {
		if (!selectedProviderModelOptions.length) return null;
		
		return (
			<>
				<div>
					<label className="block font-medium mb-1">{t("settings:providers.model")}</label>

					<Select
						value={selectedModelId === "custom-arn" ? "custom-arn" : selectedModelId}
						onValueChange={(value) => {
							setApiConfigurationField("apiModelId", value)

							// Clear custom ARN if not using custom ARN option.
							if (value !== "custom-arn" && selectedProvider === "bedrock") {
								setApiConfigurationField("awsCustomArn", "")
							}
						}}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder={t("settings:common.select")} />
						</SelectTrigger>
						<SelectContent>
							{selectedProviderModelOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
							{selectedProvider === "bedrock" && (
								<SelectItem value="custom-arn">{t("settings:labels.useCustomArn")}</SelectItem>
							)}
						</SelectContent>
					</Select>
				</div>

				{selectedProvider === "bedrock" && selectedModelId === "custom-arn" && (
					<>
						<VSCodeTextField
							value={apiConfiguration?.awsCustomArn || ""}
							onInput={(e) => {
								const value = (e.target as HTMLInputElement).value
								setApiConfigurationField("awsCustomArn", value)
							}}
							placeholder={t("settings:placeholders.customArn")}
							className="w-full">
							<label className="block font-medium mb-1">{t("settings:labels.customArn")}</label>
						</VSCodeTextField>
						<div className="text-sm text-vscode-descriptionForeground -mt-2">
							{t("settings:providers.awsCustomArnUse")}
							<ul className="list-disc pl-5 mt-1">
								<li>
									arn:aws:bedrock:eu-west-1:123456789012:inference-profile/eu.anthropic.claude-3-7-sonnet-20250219-v1:0
								</li>
								<li>
									arn:aws:bedrock:us-west-2:123456789012:provisioned-model/my-provisioned-model
								</li>
								<li>
									arn:aws:bedrock:us-east-1:123456789012:default-prompt-router/anthropic.claude:1
								</li>
							</ul>
							{t("settings:providers.awsCustomArnDesc")}
						</div>
						{apiConfiguration?.awsCustomArn &&
							(() => {
								const validation = validateBedrockArn(
									apiConfiguration.awsCustomArn,
									apiConfiguration.awsRegion,
								)

								if (!validation.isValid) {
									return (
										<div className="text-sm text-vscode-errorForeground mt-2">
											{validation.errorMessage || t("settings:providers.invalidArnFormat")}
										</div>
									)
								}

								if (validation.errorMessage) {
									return (
										<div className="text-sm text-vscode-errorForeground mt-2">
											{validation.errorMessage}
										</div>
									)
								}

								return null
							})()}
					</>
				)}

				<ModelInfoView
					apiProvider={selectedProvider}
					selectedModelId={selectedModelId}
					modelInfo={selectedModelInfo}
					isDescriptionExpanded={isDescriptionExpanded}
					setIsDescriptionExpanded={setIsDescriptionExpanded}
				/>

				<ThinkingBudget
					key={`${selectedProvider}-${selectedModelId}`}
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					modelInfo={selectedModelInfo}
				/>
			</>
		);
	};

	// Render additional model-specific settings
	const renderAdditionalModelSettings = () => {
		return (
			<>
				{REASONING_MODELS.has(selectedModelId) && (
					<ReasoningEffort
						apiConfiguration={apiConfiguration}
						setApiConfigurationField={setApiConfigurationField}
					/>
				)}

				{selectedModelInfo && selectedModelInfo.supportsPromptCache && selectedModelInfo.isPromptCacheOptional && (
					<PromptCachingControl
						apiConfiguration={apiConfiguration}
						setApiConfigurationField={setApiConfigurationField}
					/>
				)}

				{!fromWelcomeView && (
					<>
						<DiffSettingsControl
							diffEnabled={apiConfiguration.diffEnabled}
							fuzzyMatchThreshold={apiConfiguration.fuzzyMatchThreshold}
							onChange={(field, value) => setApiConfigurationField(field, value)}
						/>
						<TemperatureControl
							value={apiConfiguration.modelTemperature}
							onChange={handleInputChange("modelTemperature", noTransform)}
							maxValue={2}
						/>
						<RateLimitSecondsControl
							value={apiConfiguration.rateLimitSeconds || 0}
							onChange={(value) => setApiConfigurationField("rateLimitSeconds", value)}
						/>
					</>
				)}
			</>
		);
	};

	// Render the anthropic provider settings
	const renderAnthropicSettings = () => {
		if (selectedProvider !== "anthropic") return null;
		
		return (
			<>
				<VSCodeTextField
					value={apiConfiguration?.apiKey || ""}
					type="password"
					onInput={handleInputChange("apiKey")}
					placeholder={t("settings:placeholders.apiKey")}
					className="w-full">
					<label className="block font-medium mb-1">{t("settings:providers.anthropicApiKey")}</label>
				</VSCodeTextField>
				<div className="text-sm text-vscode-descriptionForeground -mt-2">
					{t("settings:providers.apiKeyStorageNotice")}
				</div>
				{!apiConfiguration?.apiKey && (
					<VSCodeButtonLink href="https://console.anthropic.com/settings/keys" appearance="secondary">
						{t("settings:providers.getAnthropicApiKey")}
					</VSCodeButtonLink>
				)}
				<div>
					<Checkbox
						checked={anthropicBaseUrlSelected}
						onChange={(checked: boolean) => {
							setAnthropicBaseUrlSelected(checked)

							if (!checked) {
								setApiConfigurationField("anthropicBaseUrl", "")
								setApiConfigurationField("anthropicUseAuthToken", false) // added
							}
						}}>
						{t("settings:providers.useCustomBaseUrl")}
					</Checkbox>
					{anthropicBaseUrlSelected && (
						<>
							<VSCodeTextField
								value={apiConfiguration?.anthropicBaseUrl || ""}
								type="url"
								onInput={handleInputChange("anthropicBaseUrl")}
								placeholder="https://api.anthropic.com"
								className="w-full mt-1"
							/>

							{/* added */}
							<Checkbox
								checked={apiConfiguration?.anthropicUseAuthToken ?? false}
								onChange={handleInputChange("anthropicUseAuthToken", noTransform)}
								className="w-full mt-1">
								{t("settings:providers.anthropicUseAuthToken")}
							</Checkbox>
						</>
					)}
				</div>
			</>
		);
	};

	// Render OpenRouter settings
	const renderOpenRouterSettings = () => {
		if (selectedProvider !== "openrouter") return null;
		
		return (
			<>
				<VSCodeTextField
					value={apiConfiguration?.openRouterApiKey || ""}
					type="password"
					onInput={handleInputChange("openRouterApiKey")}
					placeholder={t("settings:placeholders.apiKey")}
					className="w-full">
					<div className="flex justify-between items-center mb-1">
						<label className="block font-medium">{t("settings:providers.openRouterApiKey")}</label>
						{apiConfiguration?.openRouterApiKey && (
							<OpenRouterBalanceDisplay
								apiKey={apiConfiguration.openRouterApiKey}
								baseUrl={apiConfiguration.openRouterBaseUrl}
							/>
						)}
					</div>
				</VSCodeTextField>
				<div className="text-sm text-vscode-descriptionForeground -mt-2">
					{t("settings:providers.apiKeyStorageNotice")}
				</div>
				{!apiConfiguration?.openRouterApiKey && (
					<VSCodeButtonLink
						href={getOpenRouterAuthUrl(uriScheme)}
						style={{ width: "100%" }}
						appearance="primary">
						{t("settings:providers.getOpenRouterApiKey")}
					</VSCodeButtonLink>
				)}
				{!fromWelcomeView && (
					<>
						<div>
							<Checkbox
								checked={openRouterBaseUrlSelected}
								onChange={(checked: boolean) => {
									setOpenRouterBaseUrlSelected(checked)

									if (!checked) {
										setApiConfigurationField("openRouterBaseUrl", "")
									}
								}}>
								{t("settings:providers.useCustomBaseUrl")}
							</Checkbox>
							{openRouterBaseUrlSelected && (
								<VSCodeTextField
									value={apiConfiguration?.openRouterBaseUrl || ""}
									type="url"
									onInput={handleInputChange("openRouterBaseUrl")}
									placeholder="Default: https://openrouter.ai/api/v1"
									className="w-full mt-1"
								/>
							)}
						</div>
						<Checkbox
							checked={apiConfiguration?.openRouterUseMiddleOutTransform ?? true}
							onChange={handleInputChange("openRouterUseMiddleOutTransform", noTransform)}>
							<Trans
								i18nKey="settings:providers.openRouterTransformsText"
								components={{
									// eslint-disable-next-line jsx-a11y/anchor-has-content
									a: <a href="https://openrouter.ai/docs/transforms" />,
								}}
							/>
						</Checkbox>
					</>
				)}
			</>
		);
	};

	// Main render method
	return (
		<div className="flex flex-col gap-3">
			{renderProviderSelector()}
			{errorMessage && <ApiErrorMessage errorMessage={errorMessage} />}
			{renderOpenRouterSettings()}
			{renderAnthropicSettings()}
			{renderClaudeCodeSettings()}
			{renderHumanRelaySettings()}
			{renderModelPickers()}
			{renderStandardModelOptions()}
			{renderAdditionalModelSettings()}
		</div>
	)
}

export default memo(ApiOptions)