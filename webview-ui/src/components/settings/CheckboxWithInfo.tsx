import React from "react"
import { Checkbox } from "vscrui"

interface CheckboxWithInfoProps {
	/**
	 * Current checked state
	 */
	checked: boolean

	/**
	 * Label to display
	 */
	label: string

	/**
	 * Optional tooltip title for info icon
	 */
	infoTooltip?: string

	/**
	 * Optional description to display below checkbox
	 */
	description?: string

	/**
	 * Callback when checked state changes
	 */
	onChange: (checked: boolean) => void

	/**
	 * Optional CSS class names
	 */
	className?: string

	/**
	 * Optional child elements
	 */
	children?: React.ReactNode
}

/**
 * Checkbox with optional info icon and description
 * Used consistently across provider settings
 */
export const CheckboxWithInfo: React.FC<CheckboxWithInfoProps> = ({
	checked,
	label,
	infoTooltip,
	description,
	onChange,
	className,
	children,
}) => {
	return (
		<div className={className}>
			<div className="flex flex-col gap-1">
				<Checkbox checked={checked} onChange={onChange}>
					<div className="flex items-center gap-1">
						<span className="font-medium">{label}</span>
						{infoTooltip && (
							<i
								className="codicon codicon-info text-vscode-descriptionForeground"
								title={infoTooltip}
								style={{ fontSize: "12px" }}
							/>
						)}
					</div>
				</Checkbox>

				{description && <div className="text-sm text-vscode-descriptionForeground ml-6">{description}</div>}

				{children}
			</div>
		</div>
	)
}
