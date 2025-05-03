import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"
import * as path from "path"
import * as os from "os"
import { spawn } from "child_process"

import { ModelInfo } from "../../shared/api"
import { ApiHandler, SingleCompletionHandler } from "../index"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import { XmlMatcher } from "../../utils/xml-matcher"

/**
 * Claude Code provider that uses the Claude Code CLI to interact with Claude
 */
export class ClaudeCodeHandler extends BaseProvider implements ApiHandler, SingleCompletionHandler {
    // Check if Claude Code is authenticated
    public static async checkAuthentication(claudeCodePath: string = "claude-code"): Promise<boolean> {
        try {
            // Run the auth status command
            const childProcess = spawn(claudeCodePath, ["auth", "status", "--json"], {
                shell: true,
                env: {
                    ...process.env,
                    NODE_NO_WARNINGS: "1", // Suppress warnings
                },
            })
            
            let output = ""
            for await (const chunk of childProcess.stdout) {
                output += chunk.toString()
            }
            
            const errorOutput: string[] = []
            childProcess.stderr.on("data", (data) => {
                errorOutput.push(data.toString())
            })
            
            const exitCode = await new Promise<number>((resolve) => {
                childProcess.on("close", (code) => resolve(code || 0))
            })
            
            if (exitCode !== 0) {
                console.error(`Claude Code auth status command failed with code ${exitCode}`)
                console.error(`Error output: ${errorOutput.join("")}`)
                return false
            }
            
            if (!output) {
                return false
            }
            
            try {
                const status = JSON.parse(output)
                return status.authenticated === true
            } catch (error) {
                console.error("Failed to parse Claude Code auth status output:", error)
                return false
            }
        } catch (error) {
            console.error("Error checking Claude Code authentication:", error)
            return false
        }
    }
    
    static readonly defaultModels = {
        "claude-3-opus-20240229": {
            maxTokens: 4096,
            contextWindow: 200000,
            supportsImages: true,
            supportsPromptCache: false,
            supportsComputerUse: true,
            inputPrice: 15,
            outputPrice: 75,
            description: "Claude 3 Opus - The most powerful Claude model",
        },
        "claude-3-sonnet-20240229": {
            maxTokens: 4096,
            contextWindow: 200000,
            supportsImages: true,
            supportsPromptCache: false,
            supportsComputerUse: true,
            inputPrice: 3,
            outputPrice: 15,
            description: "Claude 3 Sonnet - Balance of intelligence and speed",
        },
        "claude-3-haiku-20240307": {
            maxTokens: 4096,
            contextWindow: 200000,
            supportsImages: true,
            supportsPromptCache: false,
            supportsComputerUse: true,
            inputPrice: 0.25,
            outputPrice: 1.25,
            description: "Claude 3 Haiku - Fastest Claude model",
        },
        "claude-3-5-sonnet-20240620": {
            maxTokens: 4096,
            contextWindow: 200000,
            supportsImages: true,
            supportsPromptCache: false,
            supportsComputerUse: true,
            inputPrice: 3,
            outputPrice: 15,
            description: "Claude 3.5 Sonnet - More capable and faster",
        },
        "claude-3-7-sonnet-20250219": {
            maxTokens: 4096,
            contextWindow: 200000,
            supportsImages: true,
            supportsPromptCache: false,
            supportsComputerUse: true,
            thinking: true,
            inputPrice: 3,
            outputPrice: 15, 
            description: "Claude 3.7 Sonnet - With thinking capability",
        },
    } as const

    protected options: {
        claudeCodePath?: string
        claudeCodeModelId?: string
        modelTemperature?: number
        includeMaxTokens?: boolean
        modelMaxTokens?: number
        modelMaxThinkingTokens?: number
        reasoningEffort?: "low" | "medium" | "high"
    }
    
    private isAuthenticated: boolean = false
    private authChecked: boolean = false
    private authError: string | null = null

    constructor(options: {
        claudeCodePath?: string
        claudeCodeModelId?: string
        modelTemperature?: number
        includeMaxTokens?: boolean
        modelMaxTokens?: number
        modelMaxThinkingTokens?: number
        reasoningEffort?: "low" | "medium" | "high"
    }) {
        super()
        this.options = options
        
        // Check authentication in the background
        this.checkAuthentication()
    }
    
    /**
     * Validate and normalize a path to the Claude Code CLI
     * @param path Path to validate
     * @returns Normalized path or "claude-code" if using default
     */
    private validateCliPath(path?: string): string {
        if (!path) {
            return "claude-code" // Default executable name
        }
        
        // Trim whitespace
        const trimmedPath = path.trim()
        
        // If empty after trimming, use default
        if (!trimmedPath) {
            return "claude-code"
        }
        
        // Check for potential security issues - no shell metacharacters allowed
        const shellMetacharacters = /[;&|<>$`\\"\s]/
        if (shellMetacharacters.test(trimmedPath)) {
            console.warn(`Suspicious characters in Claude Code CLI path: "${trimmedPath}". Using default instead.`)
            return "claude-code"
        }
        
        return trimmedPath
    }
    
    /**
     * Retry a function with exponential backoff
     * @param fn Function to retry
     * @param maxRetries Maximum number of retries
     * @param initialDelayMs Initial delay in milliseconds
     * @param maxDelayMs Maximum delay in milliseconds
     * @param retryableErrors Array of error substrings that are retryable
     * @returns Result of the function or throws an error if all retries fail
     */
    private async retryWithBackoff<T>(
        fn: () => Promise<T>,
        maxRetries = 3,
        initialDelayMs = 100,
        maxDelayMs = 3000,
        retryableErrors: string[] = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'timeout']
    ): Promise<T> {
        let lastError: Error | null = null
        let delay = initialDelayMs
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn()
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))
                
                // Check if error is retryable
                const isRetryable = retryableErrors.some(errStr => 
                    lastError && lastError.message.includes(errStr)
                )
                
                if (!isRetryable || attempt === maxRetries) {
                    throw lastError
                }
                
                console.info(`Retrying Claude Code CLI operation after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
                
                // Wait before next retry
                await new Promise(resolve => setTimeout(resolve, delay))
                
                // Exponential backoff with jitter
                delay = Math.min(delay * 2 * (0.9 + Math.random() * 0.2), maxDelayMs)
            }
        }
        
        // This should never happen because of the throw in the loop, but TypeScript needs it
        throw lastError || new Error("Max retries exceeded")
    }

    /**
     * Check if the user is authenticated with Claude Code CLI
     */
    private async checkAuthentication(): Promise<void> {
        try {
            const claudeCodePath = this.validateCliPath(this.options.claudeCodePath)
            
            // First check if the CLI is installed by trying to run the version command
            const isCliInstalled = await this.isClaudeCodeInstalled(claudeCodePath)
            
            if (!isCliInstalled) {
                this.authError = "Claude Code CLI not found. Please install it from https://claude.ai/code"
                this.authChecked = true
                this.isAuthenticated = false
                return
            }
            
            // Check authentication status with retry for network issues
            try {
                this.isAuthenticated = await this.retryWithBackoff(
                    () => ClaudeCodeHandler.checkAuthentication(claudeCodePath),
                    2,  // max retries
                    100, // initial delay
                    1000 // max delay
                )
            } catch (error) {
                console.error("Failed to check Claude Code authentication after retries:", error)
                this.isAuthenticated = false
            }
            
            if (!this.isAuthenticated) {
                this.authError = "Not authenticated with Claude Code CLI. Please run 'claude-code login' in your terminal"
            } else {
                this.authError = null
            }
            
            this.authChecked = true
        } catch (error) {
            console.error("Error checking Claude Code authentication:", error)
            this.authError = "Error checking authentication status"
            this.authChecked = true
            this.isAuthenticated = false
        }
    }
    
    /**
     * Check if Claude Code CLI is installed
     */
    private async isClaudeCodeInstalled(claudeCodePath: string): Promise<boolean> {
        try {
            const childProcess = spawn(claudeCodePath, ["--version"], {
                shell: true,
            })
            
            const exitCode = await new Promise<number>((resolve) => {
                childProcess.on("close", (code) => resolve(code || 0))
            })
            
            return exitCode === 0
        } catch (error) {
            console.error("Error checking Claude Code installation:", error)
            return false
        }
    }

    /**
     * Execute a Claude Code CLI command and return the result as a stream
     * @param command - Command arguments to pass to the Claude Code CLI
     * @param input - Optional input to send to the process stdin
     * @param timeout - Optional timeout in milliseconds (defaults to 60 seconds)
     */
    private async executeClaudeCodeCommand(
        command: string[],
        input?: string,
        timeout = 60000
    ): Promise<AsyncIterable<string>> {
        return new Promise((resolve, reject) => {
            const claudeCodePath = this.validateCliPath(this.options.claudeCodePath)
            let stderrOutput = ""
            let hasExited = false

            // Set a timeout
            const timeoutId = setTimeout(() => {
                if (!hasExited) {
                    try {
                        childProcess.kill()
                    } catch (e) {
                        console.error("Failed to kill Claude Code CLI process:", e)
                    }
                    reject(new Error(`Claude Code CLI command timed out after ${timeout}ms`))
                }
            }, timeout)

            const childProcess = spawn(claudeCodePath, command, {
                shell: true,
                env: {
                    ...process.env,
                    NODE_NO_WARNINGS: "1", // Suppress warnings
                },
            })

            // Create an async generator to stream the output
            const stream = (async function* () {
                try {
                    for await (const chunk of childProcess.stdout) {
                        yield chunk.toString()
                    }
                } catch (error) {
                    console.error("Error reading from Claude Code CLI stdout:", error)
                    throw new Error(`Failed to read from Claude Code CLI: ${error instanceof Error ? error.message : String(error)}`)
                }
            })()

            // Handle standard input if provided
            if (input) {
                try {
                    childProcess.stdin.write(input)
                    childProcess.stdin.end()
                } catch (error) {
                    reject(new Error(`Failed to write to Claude Code CLI stdin: ${error instanceof Error ? error.message : String(error)}`))
                    clearTimeout(timeoutId)
                    return
                }
            }

            // Handle errors
            childProcess.on("error", (err) => {
                hasExited = true
                clearTimeout(timeoutId)
                
                // Handle common errors
                if (err.message.includes("ENOENT")) {
                    reject(new Error(`Claude Code CLI not found. Make sure it's installed and in your PATH, or specify the full path in settings.`))
                } else if (err.message.includes("EACCES")) {
                    reject(new Error(`Permission denied when executing Claude Code CLI. Check file permissions.`))
                } else {
                    reject(new Error(`Failed to start Claude Code CLI: ${err.message}`))
                }
            })

            childProcess.stderr.on("data", (data) => {
                const stderr = data.toString()
                stderrOutput += stderr
                console.error(`Claude Code CLI stderr: ${stderr}`)
                
                // Check for common error messages in stderr
                if (stderr.includes("not authenticated") || stderr.includes("auth")) {
                    this.isAuthenticated = false
                    this.authError = "Not authenticated with Claude Code CLI"
                }
            })

            childProcess.on("close", (code) => {
                hasExited = true
                clearTimeout(timeoutId)
                
                if (code !== 0) {
                    console.error(`Claude Code CLI exited with code ${code}`)
                    
                    // Only log as an error when not resolved yet
                    if (stderrOutput && code !== null && code !== 0) {
                        // Don't reject here - we'll still return the stream 
                        // but log the error for debugging
                        console.error(`Claude Code CLI error: ${stderrOutput}`)
                    }
                }
            })

            resolve(stream)
        })
    }

    /**
     * Wait for authentication check to complete
     * @param canYield - Whether to yield status messages (for streaming APIs)
     * @returns A tuple with [isAuthenticated, errorMessage]
     */
    private async waitForAuthentication(canYield = false): Promise<[boolean, string | null]> {
        // Wait for authentication check to complete if not done yet
        if (!this.authChecked) {
            // Note: Yielding is handled by the caller in generator functions
            
            await new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.authChecked) {
                        clearInterval(checkInterval)
                        resolve()
                    }
                }, 100)
                
                // Set a timeout to avoid waiting forever
                setTimeout(() => {
                    clearInterval(checkInterval)
                    this.authError = "Authentication check timed out"
                    this.authChecked = true
                    this.isAuthenticated = false
                    resolve()
                }, 5000)
            })
        }
        
        return [this.isAuthenticated, this.authError]
    }

    /**
     * Create a message using the Claude Code CLI
     */
    override async *createMessage(
        systemPrompt: string, 
        messages: Anthropic.Messages.MessageParam[]
    ): ApiStream {
        try {
            // Wait for authentication check to complete
            const [isAuthenticated, authError] = await this.waitForAuthentication(true)
            
            // If in yielding mode, provide status
            if (true) { // canYield is always true here
                yield { type: "text", text: "Checking Claude Code CLI authentication status..." }
            }
            
            // Check if authenticated
            if (!isAuthenticated) {
                const errorMessage = authError || "Not authenticated with Claude Code CLI"
                yield { 
                    type: "text", 
                    text: `${errorMessage}\n\nTo use Claude Code CLI as a provider:\n1. Install Claude Code CLI from https://claude.ai/code\n2. Run 'claude-code login' in your terminal\n3. Verify it works by running 'claude-code chat' in your terminal` 
                }
                return
            }
            
            const modelId = this.getModel().id

            // Prepare command arguments
            const args = ["--model", modelId]
            
            // Add temperature if specified
            if (this.options.modelTemperature !== undefined) {
                args.push("--temperature", this.options.modelTemperature.toString())
            }

            // Add max tokens if specified
            if (this.options.includeMaxTokens && this.options.modelMaxTokens) {
                args.push("--max-tokens", this.options.modelMaxTokens.toString())
            }

            // Add thinking budget if applicable
            if (modelId.includes("3-7") && this.options.modelMaxThinkingTokens) {
                args.push("--thinking-budget", this.options.modelMaxThinkingTokens.toString())
            }

            // Create a temporary input file with messages and system prompt
            const inputJson = {
                system: systemPrompt,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: typeof msg.content === "string" 
                        ? msg.content 
                        : msg.content
                            .filter(item => item.type === "text")
                            .map(item => item.type === "text" ? item.text : "")
                            .join("\n")
                }))
            }

            // Use stdin to pass the input
            const inputStr = JSON.stringify(inputJson)

            // Execute Claude Code CLI command with retries for transient errors
            let stream: AsyncIterable<string>
            try {
                stream = await this.retryWithBackoff(
                    () => this.executeClaudeCodeCommand(["chat", ...args], inputStr),
                    2, // max retries
                    500, // initial delay
                    2000 // max delay
                )
            } catch (error) {
                console.error("Failed to execute Claude Code CLI command after retries:", error)
                yield { 
                    type: "text", 
                    text: `Error connecting to Claude Code CLI: ${error instanceof Error ? error.message : String(error)}` 
                }
                return
            }

            // Use XML matcher to process the output, looking for <thinking> tags
            const matcher = new XmlMatcher(
                "thinking",
                (chunk) => ({
                    type: chunk.matched ? "reasoning" : "text",
                    text: chunk.data,
                }) as const
            )

            // Process stream
            for await (const chunk of stream) {
                // Process each chunk through the matcher
                for (const processed of matcher.update(chunk)) {
                    yield processed
                }
            }

            // Process any final content
            for (const chunk of matcher.final()) {
                yield chunk
            }
        } catch (error) {
            console.error("Error in Claude Code createMessage:", error)
            if (error instanceof Error) {
                yield { type: "text", text: `Error connecting to Claude Code CLI: ${error.message}` }
            } else {
                yield { type: "text", text: "Unknown error connecting to Claude Code CLI" }
            }
        }
    }

    /**
     * Get the model info for the current model
     */
    override getModel(): { id: string; info: ModelInfo } {
        const modelId = this.options.claudeCodeModelId || "claude-3-sonnet-20240229"
        
        // Use the default model info for known models, or a generic one for custom models
        const defaultInfo = ClaudeCodeHandler.defaultModels[modelId as keyof typeof ClaudeCodeHandler.defaultModels]
        
        return {
            id: modelId,
            info: defaultInfo || {
                maxTokens: 4096,
                contextWindow: 200000,
                supportsImages: true,
                supportsPromptCache: false,
                supportsComputerUse: true,
                inputPrice: 3,
                outputPrice: 15,
                description: "Claude model via Claude Code CLI",
            },
        }
    }

    /**
     * Implementation of a single prompt completion
     */
    async completePrompt(prompt: string): Promise<string> {
        try {
            // Wait for authentication check to complete
            const [isAuthenticated, authError] = await this.waitForAuthentication(false)
            
            // Check if authenticated
            if (!isAuthenticated) {
                const errorMessage = authError || "Not authenticated with Claude Code CLI"
                throw new Error(`${errorMessage}. Please run 'claude-code login' in your terminal.`)
            }
            
            const modelId = this.getModel().id

            // Prepare command arguments
            const args = ["--model", modelId, "--no-color"]
            
            // Add temperature if specified
            if (this.options.modelTemperature !== undefined) {
                args.push("--temperature", this.options.modelTemperature.toString())
            }

            // Add max tokens if specified
            if (this.options.includeMaxTokens && this.options.modelMaxTokens) {
                args.push("--max-tokens", this.options.modelMaxTokens.toString())
            }

            // Execute command with retries for transient errors
            let stream: AsyncIterable<string>
            try {
                stream = await this.retryWithBackoff(
                    () => this.executeClaudeCodeCommand(["complete", ...args], prompt), 
                    2, // max retries
                    500, // initial delay
                    2000 // max delay
                )
            } catch (error) {
                throw new Error(`Claude Code completion error: ${error instanceof Error ? error.message : String(error)}`)
            }
            
            let result = ""
            for await (const chunk of stream) {
                result += chunk
            }
            
            return result.trim()
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Claude Code completion error: ${error.message}`)
            }
            throw error
        }
    }
}

/**
 * Get available Claude Code models by running the CLI
 */
export async function getClaudeCodeModels(claudeCodePath = "claude-code"): Promise<string[]> {
    try {
        // Use the models that we know are supported by default
        const defaultModels = Object.keys(ClaudeCodeHandler.defaultModels)
        
        // Check if CLI is installed first
        try {
            const checkProcess = spawn(claudeCodePath, ["--version"], {
                shell: true,
            })
            
            const exitCode = await new Promise<number>((resolve) => {
                checkProcess.on("close", (code) => resolve(code || 0))
            })
            
            if (exitCode !== 0) {
                console.warn("Claude Code CLI not installed or not in PATH")
                return defaultModels
            }
        } catch (error) {
            console.warn("Failed to check Claude Code CLI installation:", error)
            return defaultModels
        }
        
        // Check if authenticated
        const isAuthenticated = await ClaudeCodeHandler.checkAuthentication(claudeCodePath)
        if (!isAuthenticated) {
            console.warn("Not authenticated with Claude Code CLI")
            return defaultModels
        }
        
        // Try to get additional models from the CLI
        const childProcess = spawn(claudeCodePath, ["models", "--output", "json"], {
            shell: true,
        })
        
        let output = ""
        
        for await (const chunk of childProcess.stdout) {
            output += chunk.toString()
        }
        
        const errorOutput: string[] = []
        childProcess.stderr.on("data", (data) => {
            errorOutput.push(data.toString())
        })
        
        const exitCode = await new Promise<number>((resolve) => {
            childProcess.on("close", (code) => resolve(code || 0))
        })
        
        if (exitCode !== 0) {
            console.warn(`Claude Code models command failed with code ${exitCode}`)
            console.warn(`Error output: ${errorOutput.join("")}`)
            return defaultModels
        }
        
        if (output) {
            try {
                const models = JSON.parse(output)
                if (Array.isArray(models)) {
                    return [...new Set([...models, ...defaultModels])]
                }
            } catch (err) {
                console.warn("Failed to parse Claude Code models output:", err)
            }
        }
        
        return defaultModels
    } catch (error) {
        console.error("Failed to get Claude Code models:", error)
        return Object.keys(ClaudeCodeHandler.defaultModels)
    }
}