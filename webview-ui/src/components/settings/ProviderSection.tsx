import React from "react"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { useAppTranslation } from "@src/i18n/TranslationContext"

interface ProviderSectionProps {
	/**
	 * Optional documentation URL for the provider
	 */
	documentationUrl?: string

	/**
	 * Display name of the provider (for documentation link)
	 */
	displayName?: string

	/**
	 * Children to render inside the provider section
	 */
	children: React.ReactNode
}

/**
 * Wrapper component for provider-specific settings sections
 * Provides consistent styling and optional documentation link
 */
export const ProviderSection: React.FC<ProviderSectionProps> = ({ documentationUrl, displayName, children }) => {
	const { t } = useAppTranslation()

	return (
		<div className="flex flex-col gap-3">
			{documentationUrl && displayName && (
				<div className="flex justify-end items-center mb-1">
					<div className="text-xs text-vscode-descriptionForeground">
						<VSCodeLink href={documentationUrl} className="hover:text-vscode-foreground" target="_blank">
							{t("settings:providers.providerDocumentation", {
								provider: displayName,
							})}
						</VSCodeLink>
					</div>
				</div>
			)}

			{children}
		</div>
	)
}
