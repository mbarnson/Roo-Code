import { t } from "../../../i18n"

/**
 * Defines operations that can fail and need error formatting
 */
export type ErrorFormattingOperation =
	| "message_generation"
	| "completion"
	| "authentication"
	| "file_operation"
	| "command_execution"

/**
 * Standardized error handling for Claude Code operations
 *
 * @param error The error to handle
 * @param operation Description of the operation that failed
 * @returns A formatted error message for display
 */
export function formatErrorMessage(error: unknown, operation: ErrorFormattingOperation): string {
	if (error === null || error === undefined) {
		return t("common:errors.claude_code.unknown", { operation })
	}

	if (error instanceof Error) {
		// Check for common error patterns
		const message = error.message

		if (message.includes("ENOENT")) {
			return t("common:errors.claude_code.not_found", { operation })
		}

		if (message.includes("EACCES") || message.includes("permission")) {
			return t("common:errors.claude_code.permission_denied", { operation })
		}

		if (message.includes("timeout") || message.includes("timed out")) {
			return t("common:errors.claude_code.timeout", { operation })
		}

		if (message.includes("not authenticated") || message.includes("auth")) {
			return t("common:errors.claude_code.auth_failed", { operation })
		}

		// Return the original message if no specific pattern is found
		return t("common:errors.claude_code.general", {
			operation,
			message,
		})
	}

	// For non-Error objects, convert to string
	return t("common:errors.claude_code.general", {
		operation,
		message: String(error),
	})
}
