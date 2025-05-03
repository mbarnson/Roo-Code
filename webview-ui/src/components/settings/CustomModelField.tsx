import React from "react"
import { NumericInput } from "./NumericInput"
import { CheckboxWithInfo } from "./CheckboxWithInfo"
import { ModelInfo } from "@roo/shared/api"
import { useAppTranslation } from "@src/i18n/TranslationContext"

interface CustomModelFieldProps {
	/**
	 * Field key in the model info object
	 */
	field: keyof ModelInfo

	/**
	 * Current model info object
	 */
	modelInfo: Partial<ModelInfo>

	/**
	 * Default model info for reference/reset
	 */
	defaultModelInfo: Partial<ModelInfo>

	/**
	 * Callback when model info is updated
	 */
	onUpdate: (updatedModelInfo: Partial<ModelInfo>) => void

	/**
	 * Field type - determines how it will be rendered
	 */
	fieldType: "number" | "boolean"

	/**
	 * Translation key for the field label
	 */
	labelKey: string

	/**
	 * Translation key for the field description
	 */
	descriptionKey: string

	/**
	 * Optional placeholder for numeric fields
	 */
	placeholder?: string

	/**
	 * Optional validation function for numeric fields
	 */
	validation?: (value: number | undefined) => string

	/**
	 * Whether to allow decimal values for numeric fields
	 */
	allowDecimal?: boolean
}

/**
 * Reusable component for custom model fields
 * Handles both numeric and boolean (checkbox) fields
 */
export const CustomModelField: React.FC<CustomModelFieldProps> = ({
	field,
	modelInfo,
	defaultModelInfo,
	onUpdate,
	fieldType,
	labelKey,
	descriptionKey,
	placeholder,
	validation,
	allowDecimal = false,
}) => {
	const { t } = useAppTranslation()

	// Handle update for the specific field
	const handleUpdate = (value: any) => {
		const updatedModelInfo = {
			...modelInfo,
			[field]: value,
		}
		onUpdate(updatedModelInfo)
	}

	// Render appropriate field type
	if (fieldType === "boolean") {
		const booleanValue = modelInfo[field] as boolean | undefined

		return (
			<CheckboxWithInfo
				checked={booleanValue ?? (defaultModelInfo[field] as boolean) ?? false}
				label={t(labelKey)}
				description={t(descriptionKey)}
				onChange={handleUpdate}
			/>
		)
	} else if (fieldType === "number") {
		const numericValue = modelInfo[field] as number | undefined

		return (
			<NumericInput
				value={numericValue !== undefined ? numericValue : (defaultModelInfo[field] as number | undefined)}
				label={t(labelKey)}
				description={t(descriptionKey)}
				placeholder={placeholder || t("settings:placeholders.numbers.value")}
				validation={validation}
				allowDecimal={allowDecimal}
				onChange={handleUpdate}
			/>
		)
	}

	// Should never happen if types are correctly specified
	return null
}
