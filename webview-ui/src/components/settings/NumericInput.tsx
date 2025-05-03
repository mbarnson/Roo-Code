import React from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

interface NumericInputProps {
	/**
	 * Current value
	 */
	value: number | string | undefined

	/**
	 * Label to display
	 */
	label: string

	/**
	 * Optional description
	 */
	description?: string

	/**
	 * Optional placeholder text
	 */
	placeholder?: string

	/**
	 * Optional validation function
	 * Returns border color based on validation result
	 */
	validation?: (value: number | undefined) => string

	/**
	 * Optional minimum value
	 */
	min?: number

	/**
	 * Optional maximum value
	 */
	max?: number

	/**
	 * Whether to allow decimal values
	 */
	allowDecimal?: boolean

	/**
	 * Callback when value changes
	 */
	onChange: (value: number | undefined) => void
}

/**
 * Numeric input field with validation support
 * Used for model settings with numeric parameters
 */
export const NumericInput: React.FC<NumericInputProps> = ({
	value,
	label,
	description,
	placeholder,
	validation,
	min,
	max,
	allowDecimal = false,
	onChange,
}) => {
	// Default validation colors based on VS Code theme variables
	const defaultValidation = (value: number | undefined): string => {
		if (value === undefined) return "var(--vscode-input-border)"

		if (min !== undefined && value < min) return "var(--vscode-errorForeground)"
		if (max !== undefined && value > max) return "var(--vscode-errorForeground)"

		return "var(--vscode-charts-green)"
	}

	// Use provided validation or default
	const validateValue = validation || defaultValidation

	// String value for display
	const displayValue = value !== undefined ? String(value) : ""

	// Parse input to number based on settings
	const parseInput = (inputValue: string): number | undefined => {
		// For empty string, return undefined
		if (!inputValue.trim()) return undefined

		// Parse as float or int based on allowDecimal
		const parser = allowDecimal ? parseFloat : parseInt
		const parsedValue = parser(inputValue)

		// Return undefined for NaN values
		return isNaN(parsedValue) ? undefined : parsedValue
	}

	// Function now directly used inline

	return (
		<div>
			<VSCodeTextField
				value={displayValue}
				type="text"
				style={{
					borderColor: validateValue(typeof value === "string" ? parseInput(value) : value),
				}}
				onInput={(e) => {
					// Handle as Event for VSCodeTextField's expected type
					const inputElement = e.target as HTMLInputElement
					const parsedValue = parseInput(inputElement.value)
					onChange(parsedValue)
				}}
				placeholder={placeholder || ""}
				className="w-full">
				<label className="block font-medium mb-1">{label}</label>
			</VSCodeTextField>

			{description && <div className="text-sm text-vscode-descriptionForeground">{description}</div>}
		</div>
	)
}
