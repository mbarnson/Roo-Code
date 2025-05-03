// Main entry point for Claude Code provider
export * from "./claude-code"
export * from "./claude-code-models"

// Export types from claude-code-vscode only, not the implementation (to avoid conflicts)
export type { FileContextTracker, FileOperation, VsCodeIntegratedClaudeCode } from "./claude-code-vscode"

// Export DiffViewProvider and StatusReporter implementations
export { DiffViewProvider } from "./diff-view-provider"
export { StatusReporter } from "./status-reporter"

// Export types from claude-code-vscode-types
export * from "./claude-code-vscode-types"

// Factory function for creating the correct Claude Code provider
import { ClaudeCodeHandler } from "./claude-code"
import { VsCodeIntegratedClaudeCode, createVsCodeIntegratedClaudeCode } from "./claude-code-vscode"
import { DiffViewProvider } from "./diff-view-provider"
import { StatusReporter } from "./status-reporter"
import type { ProviderOptions } from "./common-types"

/**
 * Factory function for creating a Claude Code provider
 * @param options Provider options
 * @param useVsCodeIntegration Whether to use VS Code integration or direct CLI
 * @returns Claude Code provider instance
 */
export function createClaudeCodeProvider(
	options: ProviderOptions,
	useVsCodeIntegration: boolean = true,
): ClaudeCodeHandler | VsCodeIntegratedClaudeCode {
	if (useVsCodeIntegration) {
		const diffViewProvider = DiffViewProvider.create()
		const statusReporter = StatusReporter.create()

		return createVsCodeIntegratedClaudeCode({
			...options,
			diffViewProvider,
			statusReporter,
		})
	}

	return new ClaudeCodeHandler(options)
}
