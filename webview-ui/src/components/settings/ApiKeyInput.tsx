import React from "react"
import { VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useAppTranslation } from "@src/i18n/TranslationContext"

interface ApiKeyInputProps {
	/**
	 * The current API key value
	 */
	apiKey: string | undefined

	/**
	 * Label for the API key input
	 */
	label: string

	/**
	 * Optional URL for getting an API key
	 */
	getApiKeyUrl?: string

	/**
	 * Optional text for the get API key button
	 */
	getApiKeyText?: string

	/**
	 * Optional placeholder text
	 */
	placeholder?: string

	/**
	 * Callback for when the API key changes
	 */
	onApiKeyChange: (apiKey: string) => void

	/**
	 * Optional additional content to render after the input
	 * For example, a balance display component
	 */
	extraContent?: React.ReactNode

	/**
	 * Button appearance for the get API key button
	 */
	buttonAppearance?: "primary" | "secondary"
}

/**
 * Reusable component for API key inputs
 * Used across multiple provider configurations
 */
export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({
	apiKey,
	label,
	getApiKeyUrl,
	getApiKeyText,
	placeholder,
	onApiKeyChange,
	extraContent,
	buttonAppearance = "secondary",
}) => {
	const { t } = useAppTranslation()

	return (
		<>
			<VSCodeTextField
				value={apiKey || ""}
				type="password"
				onInput={(e) => onApiKeyChange((e.target as HTMLInputElement).value)}
				placeholder={placeholder || t("settings:placeholders.apiKey")}
				className="w-full">
				<div className="flex justify-between items-center mb-1">
					<label className="block font-medium">{label}</label>
					{extraContent}
				</div>
			</VSCodeTextField>

			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>

			{!apiKey && getApiKeyUrl && (
				<VSCodeButton
					appearance={buttonAppearance}
					onClick={() => window.open(getApiKeyUrl, "_blank")}
					style={buttonAppearance === "primary" ? { width: "100%" } : undefined}>
					{getApiKeyText || t("settings:providers.getApiKey")}
				</VSCodeButton>
			)}
		</>
	)
}
