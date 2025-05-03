// Main entry point for Claude Code provider
export * from './claude-code';
export * from './claude-code-models';
export * from './claude-code-vscode';
export * from './diff-view-provider';
export * from './status-reporter';

// Factory function for creating the correct Claude Code provider
import { ClaudeCodeHandler } from './claude-code';
import { VsCodeIntegratedClaudeCode, createVsCodeIntegratedClaudeCode, type VsCodeIntegratedClaudeCodeOptions } from './claude-code-vscode';
import { DiffViewProvider } from './diff-view-provider';
import { StatusReporter } from './status-reporter';
import { ProviderOptions } from '@roo/shared/api';

/**
 * Factory function for creating a Claude Code provider
 * @param options Provider options
 * @param useVsCodeIntegration Whether to use VS Code integration or direct CLI
 * @returns Claude Code provider instance
 */
export function createClaudeCodeProvider(
  options: ProviderOptions, 
  useVsCodeIntegration: boolean = true
): ClaudeCodeHandler | VsCodeIntegratedClaudeCode {
  if (useVsCodeIntegration) {
    const diffViewProvider = DiffViewProvider.create();
    const statusReporter = StatusReporter.create();
    
    return createVsCodeIntegratedClaudeCode({
      ...options,
      diffViewProvider,
      statusReporter
    });
  }
  
  return new ClaudeCodeHandler(options);
}