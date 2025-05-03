import * as vscode from "vscode"
import * as path from "path"
import { XmlMatcher } from "../../utils/xml-matcher"
import { ApiStream } from "../transform/stream"
import { ModelInfo } from "../../shared/api"
import { ApiHandler, SingleCompletionHandler } from "../index"
import { ClaudeCodeHandler } from "./claude-code"
import { Anthropic } from "@anthropic-ai/sdk"
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"
import { FileContextTracker } from "../../core/context-tracking/FileContextTracker"
import { FileDetector } from "./utils/file-detector"
import { t } from "../../i18n"

/**
 * VS Code integrated wrapper for the Claude Code CLI provider
 * This class intercepts file operations and routes them through VS Code's editor APIs
 */
export class VsCodeIntegratedClaudeCode implements ApiHandler, SingleCompletionHandler {
    private cliHandler: ClaudeCodeHandler
    private diffViewProvider: DiffViewProvider | undefined
    private fileContextTracker: FileContextTracker | undefined
    private isExecutingCommand = false
    private vsCodeIntegrationEnabled: boolean
    private fileDetector: FileDetector
    
    /**
     * Count tokens for content blocks by delegating to the underlying CLI handler
     * @param content The content to count tokens for
     * @returns Token count
     */
    async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
        return this.cliHandler.countTokens(content)
    }

    /**
     * Creates a new VS Code integrated Claude Code handler
     * 
     * @param options Configuration options for the Claude Code provider
     * @param cwd Current working directory
     */
    constructor(
        options: {
            claudeCodePath?: string
            claudeCodeModelId?: string
            modelTemperature?: number
            includeMaxTokens?: boolean
            modelMaxTokens?: number
            modelMaxThinkingTokens?: number
            reasoningEffort?: "low" | "medium" | "high"
            claudeCodeVsCodeIntegration?: boolean
        },
        private cwd: string = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ""
    ) {
        this.cliHandler = new ClaudeCodeHandler(options)
        
        // Default to enabled unless explicitly disabled
        this.vsCodeIntegrationEnabled = options.claudeCodeVsCodeIntegration !== false
        
        // Initialize file detector
        this.fileDetector = new FileDetector(cwd)
    }

    /**
     * Initialize the wrapper with VS Code components
     * @param diffViewProvider DiffViewProvider instance for handling file diffs
     * @param fileContextTracker FileContextTracker instance for tracking file context
     */
    public initialize(diffViewProvider: DiffViewProvider, fileContextTracker: FileContextTracker): void {
        this.diffViewProvider = diffViewProvider
        this.fileContextTracker = fileContextTracker
    }

    /**
     * Standardized error handling for Claude Code operations
     * 
     * @param error The error to handle
     * @param operation Description of the operation that failed
     * @returns A formatted error message for display
     */
    private formatErrorMessage(error: unknown, operation: string): string {
        if (!error) {
            return t("common:errors.claude_code.unknown", { operation });
        }
        
        if (error instanceof Error) {
            // Check for common error patterns
            const message = error.message;
            
            if (message.includes("ENOENT")) {
                return t("common:errors.claude_code.not_found", { operation });
            }
            
            if (message.includes("EACCES") || message.includes("permission")) {
                return t("common:errors.claude_code.permission_denied", { operation });
            }
            
            if (message.includes("timeout") || message.includes("timed out")) {
                return t("common:errors.claude_code.timeout", { operation });
            }
            
            if (message.includes("not authenticated") || message.includes("auth")) {
                return t("common:errors.claude_code.auth_failed", { operation });
            }
            
            // Return the original message if no specific pattern is found
            return t("common:errors.claude_code.general", { 
                operation, 
                message 
            });
        }
        
        // For non-Error objects, convert to string
        return t("common:errors.claude_code.general", { 
            operation, 
            message: String(error) 
        });
    }

    /**
     * Create a message using the Claude Code CLI with VS Code integration
     * 
     * @param systemPrompt The system prompt to send to Claude
     * @param messages The messages to send to Claude
     * @returns A stream of responses from Claude
     */
    async *createMessage(
        systemPrompt: string, 
        messages: Anthropic.Messages.MessageParam[]
    ): ApiStream {
        try {
            // Show progress in the UI
            this.showProgress("Generating response with Claude Code...")
            
            // Store original CLI output for tracking file modifications
            const fileModifications = new Map<string, string>()
            
            // Create wrapper for CLI stream that intercepts file mentions and operations
            const cliStream = this.cliHandler.createMessage(systemPrompt, messages)
            for await (const chunk of cliStream) {
                // Track file mentions in the chunk
                if (chunk.type === "text" && chunk.text) {
                    this.trackFileMentions(chunk.text)
                    
                    // Intercept file paths that might be getting modified
                    this.detectFileModifications(chunk.text, fileModifications)
                }
                
                yield chunk
            }
            
            // Handle any detected file modifications after response is complete
            await this.processDetectedFileModifications(fileModifications)
        } catch (error) {
            console.error("Error in VS Code integrated Claude Code createMessage:", error)
            yield { 
                type: "text", 
                text: this.formatErrorMessage(error, "message generation")
            }
        } finally {
            // Clean up UI indicators
            this.hideProgress()
        }
    }

    /**
     * Implementation of a single prompt completion with VS Code integration
     * 
     * @param prompt The prompt to send to Claude
     * @returns A string containing Claude's completion
     * @throws Error if the completion operation fails
     */
    async completePrompt(prompt: string): Promise<string> {
        try {
            // Show progress in the UI
            this.showProgress("Generating completion with Claude Code...")
            
            // Execute completion through CLI handler
            const completion = await this.cliHandler.completePrompt(prompt)
            
            // Track file mentions in the completion
            this.trackFileMentions(completion)
            
            return completion
        } catch (error) {
            console.error("Error in VS Code integrated Claude Code completePrompt:", error)
            // Convert error to a standardized format and rethrow
            throw new Error(this.formatErrorMessage(error, "completion"));
        } finally {
            // Clean up UI indicators
            this.hideProgress()
        }
    }

    /**
     * Get the model info for the current model
     */
    getModel(): { id: string; info: ModelInfo } {
        return this.cliHandler.getModel()
    }

    /**
     * Show progress indicator in the VS Code UI
     */
    private showProgress(message: string): void {
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: message,
                cancellable: false
            }, 
            async (progress) => {
                // This promise resolves when hideProgress is called
                return new Promise<void>((resolve) => {
                    // Store the resolve function to be called later
                    this.hideProgress = () => {
                        resolve()
                    }
                })
            }
        )
    }

    /**
     * Hide progress indicator
     * This is overwritten by showProgress to resolve the promise
     */
    private hideProgress: () => void = () => { /* No-op default implementation */ }

    /**
     * Track file mentions in the text and update the FileContextTracker
     * 
     * @param text The text to scan for file mentions
     */
    private trackFileMentions(text: string): void {
        // Skip if VS Code integration is disabled or tracking isn't available
        if (!this.fileContextTracker || !this.vsCodeIntegrationEnabled) return
        
        // Use file detector to extract file paths
        const filePaths = this.fileDetector.detectFilePaths(text);
        
        // Track each detected file path if it exists
        for (const absolutePath of filePaths) {
            // Only track existing files
            vscode.workspace.fs.stat(vscode.Uri.file(absolutePath))
                .then(() => {
                    if (this.fileContextTracker) {
                        this.fileContextTracker.trackFileContext(
                            absolutePath, 
                            "file_mentioned"
                        )
                    }
                })
                .then(undefined, () => {
                    // File doesn't exist, do nothing
                })
        }
    }

    /**
     * Detect potential file modifications in the text
     * This uses heuristics to detect when Claude Code might be modifying files
     * 
     * @param text Text to scan for file modifications
     * @param fileModifications Map to accumulate detected modifications
     */
    private detectFileModifications(text: string, fileModifications: Map<string, string>): void {
        // Use file detector to identify potential file modifications
        this.fileDetector.detectFileModifications(text, fileModifications);
    }

    /**
     * Process detected file modifications and route them through VS Code editor APIs
     * 
     * @param fileModifications Map of detected file modifications with paths as keys
     * @returns Promise that resolves when processing is complete
     */
    private async processDetectedFileModifications(fileModifications: Map<string, string>): Promise<void> {
        // Skip if VS Code integration is disabled, diff provider isn't available, or no modifications
        if (!this.diffViewProvider || 
            fileModifications.size === 0 ||
            !this.vsCodeIntegrationEnabled) return
        
        for (const [filePath, _] of fileModifications) {
            try {
                // Resolve the absolute path
                const absolutePath = path.isAbsolute(filePath) 
                    ? filePath 
                    : path.resolve(this.cwd, filePath)
                
                // Check if the file exists and was modified
                const fileExists = await this.fileExists(absolutePath)
                if (!fileExists) continue
                
                // Get the current content
                const content = await this.readFile(absolutePath)
                
                // Update file context tracking
                if (this.fileContextTracker) {
                    this.fileContextTracker.markFileAsEditedByRoo(absolutePath)
                    this.fileContextTracker.trackFileContext(absolutePath, "roo_edited")
                }
                
                // Show the modification in the diff view for review
                this.diffViewProvider.editType = "modify"
                await this.diffViewProvider.open(absolutePath)
                await this.diffViewProvider.update(content, true)
                
                // Show a message that file modifications were detected
                await vscode.window.showInformationMessage(
                    t("common:errors.claude_code.file_modified", { fileName: path.basename(absolutePath) }),
                    t("common:errors.claude_code.keep_changes"),
                    t("common:errors.claude_code.revert_changes")
                ).then(async (selection) => {
                    if (selection === t("common:errors.claude_code.keep_changes") && this.diffViewProvider) {
                        await this.diffViewProvider.saveChanges()
                    } else if (this.diffViewProvider) {
                        await this.diffViewProvider.revertChanges()
                    }
                })
            } catch (error) {
                console.error(`Error processing file modification for ${filePath}:`, error)
            }
        }
    }

    /**
     * Check if a file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(filePath))
            return true
        } catch {
            return false
        }
    }

    /**
     * Read a file's content
     */
    private async readFile(filePath: string): Promise<string> {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))
        return Buffer.from(content).toString('utf8')
    }
}

/**
 * Factory function to create a VS Code integrated Claude Code handler
 */
export function createVsCodeIntegratedClaudeCode(
    options: {
        claudeCodePath?: string
        claudeCodeModelId?: string
        modelTemperature?: number
        includeMaxTokens?: boolean
        modelMaxTokens?: number
        modelMaxThinkingTokens?: number
        reasoningEffort?: "low" | "medium" | "high"
        claudeCodeVsCodeIntegration?: boolean
        claudeCodeFileTracking?: boolean
        claudeCodeShowDiffViews?: boolean
    },
    diffViewProvider: DiffViewProvider,
    fileContextTracker: FileContextTracker,
    cwd: string = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ""
): VsCodeIntegratedClaudeCode {
    const handler = new VsCodeIntegratedClaudeCode(options, cwd)
    handler.initialize(diffViewProvider, fileContextTracker)
    return handler
}