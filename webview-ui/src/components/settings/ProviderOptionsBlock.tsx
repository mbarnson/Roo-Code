import React from "react"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { ExternalLinkIcon } from "@radix-ui/react-icons"

interface ProviderOptionsBlockProps {
	/**
	 * Content to render inside the block
	 */
	children: React.ReactNode

	/**
	 * Optional section title
	 */
	title?: string

	/**
	 * Optional documentation URL
	 */
	documentationUrl?: string

	/**
	 * Optional documentation link text
	 */
	documentationLinkText?: string

	/**
	 * Optional error message to display
	 */
	errorMessage?: string

	/**
	 * Optional CSS class names to add
	 */
	className?: string

	/**
	 * Optional nested section (for subgrouping)
	 */
	isNested?: boolean
}

/**
 * Container component for provider-specific options
 * Groups related settings with consistent styling
 */
export const ProviderOptionsBlock: React.FC<ProviderOptionsBlockProps> = ({
	children,
	title,
	documentationUrl,
	documentationLinkText,
	errorMessage,
	className = "",
	isNested = false,
}) => (
	<div
		className={`flex flex-col gap-3 provider-options-block ${className} ${isNested ? "pl-4 border-l border-vscode-panelSectionBorder" : ""}`}>
		{(title || documentationUrl) && (
			<div className="flex justify-between items-center">
				{title && <h3 className={`${isNested ? "text-base" : "text-lg"} font-medium`}>{title}</h3>}

				{documentationUrl && (
					<div className="text-xs text-vscode-descriptionForeground">
						<VSCodeLink href={documentationUrl} className="hover:text-vscode-foreground" target="_blank">
							<span className="flex items-center gap-1">
								{documentationLinkText || "Documentation"}
								<ExternalLinkIcon className="w-3 h-3" />
							</span>
						</VSCodeLink>
					</div>
				)}
			</div>
		)}

		{errorMessage && (
			<div className="text-sm text-vscode-errorForeground p-2 bg-vscode-inputValidation-errorBackground border border-vscode-inputValidation-errorBorder rounded">
				{errorMessage}
			</div>
		)}

		{children}
	</div>
)
