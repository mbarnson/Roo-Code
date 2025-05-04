import React, { useState } from "react"

export interface TroubleshootingItem {
	title: string
	content: React.ReactNode
}

export interface TroubleshootingBlockProps {
	title: string
	description?: string
	items: TroubleshootingItem[]
}

/**
 * Reusable troubleshooting block component for provider settings UI
 * Uses a collapsible accordion pattern to save space while providing detailed help
 */
export const TroubleshootingBlock: React.FC<TroubleshootingBlockProps> = ({ title, description, items }) => {
	const [openItem, setOpenItem] = useState<number | null>(null)

	const toggleItem = (index: number) => {
		if (openItem === index) {
			setOpenItem(null)
		} else {
			setOpenItem(index)
		}
	}

	return (
		<div
			className="my-3 p-3 text-sm rounded"
			style={{
				backgroundColor: "var(--vscode-editorWidget-background)",
				border: "1px solid var(--vscode-panelSection-border)",
			}}>
			<div className="flex items-center mb-2">
				<span className="codicon codicon-warning mr-2 text-vscode-editorWarning-foreground"></span>
				<span className="font-semibold">{title}</span>
			</div>

			{description && <p className="mb-2">{description}</p>}

			<div className="flex flex-col gap-1 mt-2">
				{items.map((item, index) => (
					<div key={index} className="border border-vscode-panelSection-border rounded">
						<div
							className="flex items-center justify-between p-2 cursor-pointer hover:bg-vscode-list-hoverBackground"
							onClick={() => toggleItem(index)}>
							<div className="font-medium">{item.title}</div>
							<span
								className={`codicon ${openItem === index ? "codicon-chevron-down" : "codicon-chevron-right"}`}></span>
						</div>

						{openItem === index && (
							<div className="p-2 pt-0 border-t border-vscode-panelSection-border">{item.content}</div>
						)}
					</div>
				))}
			</div>
		</div>
	)
}
