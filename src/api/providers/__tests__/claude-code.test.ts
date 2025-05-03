import { ClaudeCodeHandler } from "../claude-code"
import * as child_process from "child_process"
import { EventEmitter } from "events"

jest.mock("child_process", () => ({
    spawn: jest.fn(),
}))

describe("ClaudeCodeHandler", () => {
    let handler: ClaudeCodeHandler
    let mockStdout: any
    let mockStdin: any
    let mockStderr: any
    let mockProcess: any
    let onHandlers: Record<string, ((...args: any[]) => void)[]> = {}

    beforeEach(() => {
        jest.clearAllMocks()
        onHandlers = {}
        
        // Set up spawn mock
        mockStdout = {
            [Symbol.asyncIterator]: jest.fn(),
        }
        
        mockStdin = {
            write: jest.fn(),
            end: jest.fn(),
        }
        
        mockStderr = new EventEmitter()
        
        mockProcess = {
            stdout: mockStdout,
            stdin: mockStdin,
            stderr: mockStderr,
            on: jest.fn().mockImplementation((event: string, handler: (...args: any[]) => void) => {
                if (!onHandlers[event]) {
                    onHandlers[event] = []
                }
                onHandlers[event].push(handler)
                return mockProcess
            }),
            kill: jest.fn(),
        }
        
        // Configure the mocked spawn to return our mock process
        jest.mocked(child_process.spawn).mockReturnValue(mockProcess as any)
        
        // Set up an async iterator for the stdout
        mockStdout[Symbol.asyncIterator].mockImplementation(function* () {
            yield "Response from Claude Code CLI"
        })
        
        // Create handler with default options
        handler = new ClaudeCodeHandler({
            claudeCodeModelId: "claude-3-sonnet-20240229",
        })
        
        // Simulate successful authentication
        // @ts-ignore - Accessing private property for testing
        handler.isAuthenticated = true
        // @ts-ignore - Accessing private property for testing
        handler.authChecked = true
    })
    
    // Helper function to trigger process events
    function triggerProcessEvent(event: string, ...args: any[]) {
        if (onHandlers[event]) {
            onHandlers[event].forEach(handler => handler(...args))
        }
    }

    describe("getModel", () => {
        it("should return the correct model info", () => {
            const result = handler.getModel()
            expect(result.id).toBe("claude-3-sonnet-20240229")
            expect(result.info).toBeDefined()
            expect(result.info.supportsComputerUse).toBe(true)
            expect(result.info.contextWindow).toBe(200000)
        })

        it("should use default model if not specified", () => {
            handler = new ClaudeCodeHandler({})
            const result = handler.getModel()
            expect(result.id).toBe("claude-3-sonnet-20240229")
        })

        it("should use custom model if specified", () => {
            handler = new ClaudeCodeHandler({
                claudeCodeModelId: "claude-3-opus-20240229",
            })
            const result = handler.getModel()
            expect(result.id).toBe("claude-3-opus-20240229")
        })
    })

    describe("checkAuthentication", () => {
        it("should detect when Claude Code CLI is not installed", async () => {
            // Mock the spawn for CLI not found
            jest.mocked(child_process.spawn).mockImplementationOnce(() => {
                // Force Error event to fire
                setTimeout(() => {
                    if (onHandlers["error"]) {
                        onHandlers["error"][0](new Error("ENOENT: Command not found"))
                    }
                }, 0)
                return mockProcess as any
            })
            
            const authenticated = await ClaudeCodeHandler.checkAuthentication()
            expect(authenticated).toBe(false)
        })
        
        it("should parse authentication status correctly", async () => {
            // Mock successful auth status response
            mockStdout[Symbol.asyncIterator].mockImplementationOnce(function* () {
                yield JSON.stringify({ authenticated: true })
            })
            
            // Mock successful exit code
            jest.mocked(child_process.spawn).mockImplementationOnce(() => {
                // Force close event with success code
                setTimeout(() => {
                    if (onHandlers["close"]) {
                        onHandlers["close"][0](0)
                    }
                }, 0)
                return mockProcess as any
            })
            
            const authenticated = await ClaudeCodeHandler.checkAuthentication()
            expect(authenticated).toBe(true)
        })
        
        it("should handle invalid JSON response", async () => {
            // Mock invalid JSON response
            mockStdout[Symbol.asyncIterator].mockImplementationOnce(function* () {
                yield "This is not valid JSON"
            })
            
            // Mock successful exit code
            jest.mocked(child_process.spawn).mockImplementationOnce(() => {
                // Force close event with success code
                setTimeout(() => {
                    if (onHandlers["close"]) {
                        onHandlers["close"][0](0)
                    }
                }, 0)
                return mockProcess as any
            })
            
            const authenticated = await ClaudeCodeHandler.checkAuthentication()
            expect(authenticated).toBe(false)
        })
    })

    describe("completePrompt", () => {
        it("should call the Claude Code CLI with correct parameters", async () => {
            await handler.completePrompt("Test prompt")
            
            expect(child_process.spawn).toHaveBeenCalledWith(
                "claude-code",
                ["complete", "--model", "claude-3-sonnet-20240229", "--no-color"],
                expect.anything()
            )
        })

        it("should include temperature when specified", async () => {
            handler = new ClaudeCodeHandler({
                claudeCodeModelId: "claude-3-sonnet-20240229",
                modelTemperature: 0.7,
            })
            
            // Set authenticated for this test
            // @ts-ignore - Accessing private property for testing
            handler.isAuthenticated = true
            // @ts-ignore - Accessing private property for testing
            handler.authChecked = true
            
            await handler.completePrompt("Test prompt")
            
            expect(child_process.spawn).toHaveBeenCalledWith(
                "claude-code",
                ["complete", "--model", "claude-3-sonnet-20240229", "--temperature", "0.7", "--no-color"],
                expect.anything()
            )
        })
        
        it("should throw an error when not authenticated", async () => {
            // @ts-ignore - Accessing private property for testing
            handler.isAuthenticated = false
            // @ts-ignore - Accessing private property for testing
            handler.authChecked = true
            // @ts-ignore - Accessing private property for testing
            handler.authError = "Not authenticated with Claude Code CLI"
            
            await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
                "Not authenticated with Claude Code CLI. Please run 'claude-code login' in your terminal."
            )
        })
        
        it("should handle CLI errors", async () => {
            // Mock the spawn for CLI error
            jest.mocked(child_process.spawn).mockImplementationOnce(() => {
                // Force Error event to fire
                setTimeout(() => {
                    if (onHandlers["error"]) {
                        onHandlers["error"][0](new Error("CLI error"))
                    }
                }, 0)
                return mockProcess as any
            })
            
            await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
                "Failed to start Claude Code CLI: CLI error"
            )
        })
    })

    describe("createMessage", () => {
        it("should call the Claude Code CLI with correct parameters", async () => {
            const generator = handler.createMessage("System prompt", [
                { role: "user", content: "User message" },
            ])
            
            // Force generator to start
            await generator.next()
            
            expect(child_process.spawn).toHaveBeenCalledWith(
                "claude-code",
                ["chat", "--model", "claude-3-sonnet-20240229"],
                expect.anything()
            )
        })

        it("should include temperature and thinking budget when specified for Claude 3.7", async () => {
            handler = new ClaudeCodeHandler({
                claudeCodeModelId: "claude-3-7-sonnet-20250219",
                modelTemperature: 0.7,
                modelMaxThinkingTokens: 5000,
            })
            
            // Set authenticated for this test
            // @ts-ignore - Accessing private property for testing
            handler.isAuthenticated = true
            // @ts-ignore - Accessing private property for testing
            handler.authChecked = true
            
            const generator = handler.createMessage("System prompt", [
                { role: "user", content: "User message" },
            ])
            
            // Force generator to start
            await generator.next()
            
            expect(child_process.spawn).toHaveBeenCalledWith(
                "claude-code",
                [
                    "chat", 
                    "--model", 
                    "claude-3-7-sonnet-20250219", 
                    "--temperature", 
                    "0.7", 
                    "--thinking-budget", 
                    "5000"
                ],
                expect.anything()
            )
        })
        
        it("should return authentication error message when not authenticated", async () => {
            // @ts-ignore - Accessing private property for testing
            handler.isAuthenticated = false
            // @ts-ignore - Accessing private property for testing
            handler.authChecked = true
            // @ts-ignore - Accessing private property for testing
            handler.authError = "Not authenticated with Claude Code CLI"
            
            const generator = handler.createMessage("System prompt", [
                { role: "user", content: "User message" },
            ])
            
            const result = await generator.next()
            expect(result.value).toEqual({
                type: "text",
                text: expect.stringContaining("Not authenticated with Claude Code CLI")
            })
            expect(result.value.text).toContain("claude-code login")
        })
        
        it("should handle XML tags in output", async () => {
            // Set up XML output with thinking tags
            mockStdout[Symbol.asyncIterator].mockImplementationOnce(function* () {
                yield "Some text before <thinking>"
                yield "This is my reasoning"
                yield "</thinking> and text after"
            })
            
            const generator = handler.createMessage("System prompt", [
                { role: "user", content: "User message" },
            ])
            
            // Consume all values from the generator
            const results = []
            for await (const chunk of generator) {
                results.push(chunk)
            }
            
            // Verify output processing
            expect(results).toEqual([
                { type: "text", text: "Some text before " },
                { type: "reasoning", text: "This is my reasoning" },
                { type: "text", text: " and text after" }
            ])
        })
    })
    
    describe("executeClaudeCodeCommand", () => {
        it("should handle CLI not found error", async () => {
            // Mock the spawn for CLI not found
            jest.mocked(child_process.spawn).mockImplementationOnce(() => {
                // Force Error event to fire
                setTimeout(() => {
                    if (onHandlers["error"]) {
                        onHandlers["error"][0](new Error("ENOENT: Command not found"))
                    }
                }, 0)
                return mockProcess as any
            })
            
            // @ts-ignore - Accessing private method for testing
            await expect(handler.executeClaudeCodeCommand(["test"])).rejects.toThrow(
                "Claude Code CLI not found"
            )
        })
        
        it("should handle permission denied error", async () => {
            // Mock the spawn for permission denied
            jest.mocked(child_process.spawn).mockImplementationOnce(() => {
                // Force Error event to fire
                setTimeout(() => {
                    if (onHandlers["error"]) {
                        onHandlers["error"][0](new Error("EACCES: Permission denied"))
                    }
                }, 0)
                return mockProcess as any
            })
            
            // @ts-ignore - Accessing private method for testing
            await expect(handler.executeClaudeCodeCommand(["test"])).rejects.toThrow(
                "Permission denied when executing Claude Code CLI"
            )
        })
        
        it("should set authentication status to false when stderr contains auth error", async () => {
            // @ts-ignore - Accessing private method for testing
            const streamPromise = handler.executeClaudeCodeCommand(["test"])
            
            // Emit stderr data with auth error
            mockStderr.emit("data", Buffer.from("Error: not authenticated"))
            
            // Resolve the promise
            triggerProcessEvent("close", 0)
            
            // Get the stream
            const stream = await streamPromise
            
            // Check that authentication status was updated
            // @ts-ignore - Accessing private property for testing
            expect(handler.isAuthenticated).toBe(false)
            // @ts-ignore - Accessing private property for testing
            expect(handler.authError).toBe("Not authenticated with Claude Code CLI")
        })
        
        it("should handle timeout errors", async () => {
            // @ts-ignore - Accessing private method for testing
            const commandPromise = handler.executeClaudeCodeCommand(["test"], undefined, 100)
            
            // Wait for the timeout
            await new Promise(resolve => setTimeout(resolve, 110))
            
            // Check that the promise rejects with a timeout error
            await expect(commandPromise).rejects.toThrow("timed out")
        })
    })
    
    describe("validateCliPath", () => {
        it("should return default path when input is undefined", async () => {
            // @ts-ignore - Accessing private method for testing
            const result = handler.validateCliPath(undefined)
            expect(result).toBe("claude-code")
        })
        
        it("should return default path when input is empty", async () => {
            // @ts-ignore - Accessing private method for testing
            const result = handler.validateCliPath("")
            expect(result).toBe("claude-code")
        })
        
        it("should return default path when input contains shell metacharacters", async () => {
            // @ts-ignore - Accessing private method for testing
            const result = handler.validateCliPath("claude-code; rm -rf /")
            expect(result).toBe("claude-code")
        })
        
        it("should return trimmed input when valid", async () => {
            // @ts-ignore - Accessing private method for testing
            const result = handler.validateCliPath("  /usr/local/bin/claude-code  ")
            expect(result).toBe("/usr/local/bin/claude-code")
        })
    })
    
    describe("retryWithBackoff", () => {
        it("should retry on retryable errors", async () => {
            const mockFn = jest.fn()
            // First call throws a retryable error, second succeeds
            mockFn.mockImplementationOnce(() => {
                throw new Error("ECONNRESET: Connection reset")
            })
            mockFn.mockImplementationOnce(() => {
                return "success"
            })
            
            // @ts-ignore - Accessing private method for testing
            const result = await handler.retryWithBackoff(
                mockFn,
                1, // max retries
                10, // initial delay
                20  // max delay
            )
            
            expect(mockFn).toHaveBeenCalledTimes(2)
            expect(result).toBe("success")
        })
        
        it("should not retry on non-retryable errors", async () => {
            const mockFn = jest.fn()
            // Throw a non-retryable error
            mockFn.mockImplementationOnce(() => {
                throw new Error("Not a retryable error")
            })
            
            // @ts-ignore - Accessing private method for testing
            await expect(handler.retryWithBackoff(
                mockFn,
                1, // max retries
                10, // initial delay
                20  // max delay
            )).rejects.toThrow("Not a retryable error")
            
            expect(mockFn).toHaveBeenCalledTimes(1)
        })
        
        it("should throw after max retries", async () => {
            const mockFn = jest.fn()
            // Always throw a retryable error
            mockFn.mockImplementation(() => {
                throw new Error("ECONNRESET: Connection reset")
            })
            
            // @ts-ignore - Accessing private method for testing
            await expect(handler.retryWithBackoff(
                mockFn,
                2, // max retries
                10, // initial delay
                20  // max delay
            )).rejects.toThrow("ECONNRESET")
            
            expect(mockFn).toHaveBeenCalledTimes(3) // Initial + 2 retries
        })
    })
})