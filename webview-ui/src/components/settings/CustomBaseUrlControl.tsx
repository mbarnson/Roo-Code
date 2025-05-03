import React from "react"
import { Checkbox } from "vscrui"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useAppTranslation } from "@src/i18n/TranslationContext"

interface CustomBaseUrlControlProps {
	/**
	 * Whether the custom base URL option is selected
	 */
	isSelected: boolean

	/**
	 * The current base URL value
	 */
	baseUrl: string | undefined

	/**
	 * Default URL to show as placeholder
	 */
	defaultUrl?: string

	/**
	 * Label for the checkbox
	 */
	label?: string

	/**
	 * Callback when selection state changes
	 */
	onSelectionChange: (checked: boolean) => void

	/**
	 * Callback when URL value changes
	 */
	onUrlChange: (url: string) => void
}

/**
 * Reusable component for custom base URL inputs
 * Used across multiple provider configurations
 */
export const CustomBaseUrlControl: React.FC<CustomBaseUrlControlProps> = ({
	isSelected,
	baseUrl,
	defaultUrl,
	label,
	onSelectionChange,
	onUrlChange,
}) => {
	const { t } = useAppTranslation()

	return (
		<div>
			<Checkbox checked={isSelected} onChange={(checked: boolean) => onSelectionChange(checked)}>
				{label || t("settings:providers.useCustomBaseUrl")}
			</Checkbox>

			{isSelected && (
				<VSCodeTextField
					value={baseUrl || ""}
					type="url"
					onInput={(e) => onUrlChange((e.target as HTMLInputElement).value)}
					placeholder={defaultUrl || ""}
					className="w-full mt-1"
				/>
			)}
		</div>
	)
}
