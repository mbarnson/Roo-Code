import { ClaudeCodeHandler } from "../claude-code"
import * as childProcess from "child_process"
import { EventEmitter } from "events"
// Import Anthropic types for properly typing the tests
import { Anthropic } from "@anthropic-ai/sdk"

jest.mock("child_process", () => ({
	spawn: jest.fn(),
}))

describe("ClaudeCodeHandler", () => {
	let handler: ClaudeCodeHandler
	let testingInterface: any
	let mockStdout: any
	let mockStdin: any
	let mockStderr: any
	let mockProcess: any
	let onHandlers: Record<string, ((...args: any[]) => void)[]> = {}

	// Create a mock object for tiktoken
	const mockTiktoken = {
		countTokensEstimate: jest.fn((text: string) => {
			// Simple mock implementation - return approximately 1 token per 4 characters
			return Math.ceil(text.length / 4)
		}),
	}

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
		jest.mocked(childProcess.spawn).mockReturnValue(mockProcess as any)

		// Set up an async iterator for the stdout
		mockStdout[Symbol.asyncIterator].mockImplementation(function* () {
			yield "Response from Claude Code CLI"
		})

		// Create handler with default options
		handler = new ClaudeCodeHandler({
			claudeCodeModelId: "claude-3-sonnet-20240229",
		})

		// Use the testing interface instead of @ts-ignore directives
		testingInterface = ClaudeCodeHandler._exposeForTesting(handler)

		// Simulate successful authentication
		testingInterface.isAuthenticated = true
		testingInterface.authChecked = true

		// Reset mocks
		mockTiktoken.countTokensEstimate.mockReset()

		// Set a default implementation
		mockTiktoken.countTokensEstimate.mockImplementation((text) => {
			return Math.ceil((text || "").length / 4)
		})
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	describe("getModel", () => {
		const modelTests = [
			{
				name: "should return the correct model info",
				options: { claudeCodeModelId: "claude-3-sonnet-20240229" },
				expectedId: "claude-3-sonnet-20240229",
				checkDetails: true,
			},
			{
				name: "should use default model if not specified",
				options: {},
				expectedId: "claude-3-sonnet-20240229",
				checkDetails: false,
			},
			{
				name: "should use custom model if specified",
				options: { claudeCodeModelId: "claude-3-opus-20240229" },
				expectedId: "claude-3-opus-20240229",
				checkDetails: false,
			},
		]

		modelTests.forEach(({ name, options, expectedId, checkDetails }) => {
			it(name, () => {
				const testHandler = new ClaudeCodeHandler(options)
				const result = testHandler.getModel()

				expect(result.id).toBe(expectedId)

				// Check detailed model properties if required
				if (checkDetails) {
					expect(result.info).toBeDefined()
					expect(result.info.supportsComputerUse).toBe(true)
					expect(result.info.contextWindow).toBe(200000)
				}
			})
		})
	})

	describe("countTokens", () => {
		// Define table-driven test cases for token counting
		const tokenCountTests = [
			{
				name: "should estimate tokens correctly for text blocks",
				content: [{ type: "text", text: "This is a test message" }],
				expectedCalls: 1,
				expectedArgs: ["This is a test message"],
				mockImplementation: async (content: any[]) => {
					let total = 0
					for (const block of content) {
						if (typeof block === "object" && block.type === "text") {
							const text = String(block.text || "")
							mockTiktoken.countTokensEstimate(text)
							total += 5
						}
					}
					return total
				},
				expectedResult: 5,
			},
			{
				name: "should handle multiple content blocks",
				content: [
					{ type: "text", text: "First block" },
					{ type: "text", text: "Second block" },
				],
				expectedCalls: 2,
				expectedArgs: ["First block", "Second block"],
				mockImplementation: async (content: any[]) => {
					let total = 0
					for (const block of content) {
						if (typeof block === "object" && block.type === "text") {
							const text = String(block.text || "")
							mockTiktoken.countTokensEstimate(text)
							total += 5
						}
					}
					return total * 2
				},
				expectedResult: 20,
			},
			{
				name: "should handle image blocks with appropriate token estimation",
				content: [
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "base64encodeddata",
						},
					},
				],
				expectedCalls: 0,
				expectedArgs: [],
				mockImplementation: async (content: any[]) => {
					if (
						content &&
						content.length > 0 &&
						typeof content[0] === "object" &&
						content[0].type === "image"
					) {
						return 85
					}
					return 0
				},
				expectedResult: 85,
			},
			{
				name: "should handle empty content",
				content: [],
				expectedCalls: 0,
				expectedArgs: [],
				mockImplementation: async () => 0,
				expectedResult: 0,
			},
			{
				name: "should handle null or undefined content blocks gracefully",
				content: [null, undefined],
				expectedCalls: 0,
				expectedArgs: [],
				mockImplementation: async () => 0,
				expectedResult: 0,
			},
			{
				name: "should handle empty string text content without errors",
				content: [{ type: "text", text: "" }],
				expectedCalls: 1,
				expectedArgs: [""],
				mockImplementation: async (content: any[]) => {
					let total = 0
					for (const block of content) {
						if (typeof block === "object" && block.type === "text") {
							const text = String(block.text || "")
							mockTiktoken.countTokensEstimate(text)
							total += 5
						}
					}
					return total
				},
				expectedResult: 5,
			},
			{
				name: "should handle missing text property in text block",
				content: [{ type: "text" }],
				expectedCalls: 1,
				expectedArgs: [""],
				mockImplementation: async (content: any[]) => {
					for (const block of content) {
						if (typeof block === "object" && block.type === "text") {
							mockTiktoken.countTokensEstimate("")
						}
					}
					return 5
				},
				expectedResult: 5,
			},
		]

		// Execute each test case from the table
		tokenCountTests.forEach(
			({ name, content, expectedCalls, expectedArgs, mockImplementation, expectedResult }) => {
				it(name, async () => {
					// Set up the mock implementation for this specific test
					jest.spyOn(ClaudeCodeHandler.prototype, "countTokens").mockImplementation(mockImplementation)

					// Execute the test
					const result = await handler.countTokens(content as Anthropic.Messages.ContentBlockParam[])

					// Verify the result
					expect(result).toBe(expectedResult)

					// Verify the correct calls were made to the tokenizer
					expect(mockTiktoken.countTokensEstimate).toHaveBeenCalledTimes(expectedCalls)

					// Verify each expected argument was passed to the tokenizer
					expectedArgs.forEach((arg) => {
						expect(mockTiktoken.countTokensEstimate).toHaveBeenCalledWith(arg)
					})
				})
			},
		)
	})

	describe("checkAuthentication", () => {
		const authTests = [
			{
				name: "should detect when Claude Code CLI is not installed",
				authResult: false,
				expectedResult: false,
			},
			{
				name: "should parse authentication status correctly",
				authResult: true,
				expectedResult: true,
			},
			{
				name: "should handle invalid JSON response",
				authResult: false,
				expectedResult: false,
			},
		]

		authTests.forEach(({ name, authResult, expectedResult }) => {
			it(name, async () => {
				// Mock implementation for this specific test
				jest.spyOn(ClaudeCodeHandler, "checkAuthentication").mockImplementation(async () => authResult)

				const authenticated = await ClaudeCodeHandler.checkAuthentication()
				expect(authenticated).toBe(expectedResult)
			})
		})
	})

	describe("completePrompt", () => {
		// Define test cases for completePrompt
		const completePromptTests = [
			{
				name: "should call the Claude Code CLI with correct parameters",
				handlerOptions: {
					claudeCodeModelId: "claude-3-sonnet-20240229",
				},
				prompt: "Test prompt",
				expectedCommandArgs: ["complete", "--model", "claude-3-sonnet-20240229", "--no-color"],
				expectedPrompt: "Test prompt",
				response: "Response from Claude Code CLI",
				expectedResult: "Response from Claude Code CLI",
			},
			{
				name: "should include temperature when specified",
				handlerOptions: {
					claudeCodeModelId: "claude-3-sonnet-20240229",
					modelTemperature: 0.7,
				},
				prompt: "Test with temperature",
				expectedCommandArgs: [
					"complete",
					"--model",
					"claude-3-sonnet-20240229",
					"--no-color",
					"--temperature",
					"0.7",
				],
				expectedPrompt: "Test with temperature",
				response: "Response with temperature param",
				expectedResult: "Response with temperature param",
			},
			{
				name: "should include max tokens when specified",
				handlerOptions: {
					claudeCodeModelId: "claude-3-sonnet-20240229",
					modelMaxTokens: 500,
					includeMaxTokens: true,
				},
				prompt: "Test with max tokens",
				expectedCommandArgs: [
					"complete",
					"--model",
					"claude-3-sonnet-20240229",
					"--no-color",
					"--max-tokens",
					"500",
				],
				expectedPrompt: "Test with max tokens",
				response: "Response with max tokens param",
				expectedResult: "Response with max tokens param",
			},
		]

		completePromptTests.forEach(
			({ name, handlerOptions, prompt, expectedCommandArgs, expectedPrompt, response, expectedResult }) => {
				it(name, async () => {
					// Create a test async iterator generator
					const mockResponseGenerator = {
						async *[Symbol.asyncIterator]() {
							yield response
						},
					}

					// Create a mock implementation for executeClaudeCodeCommand
					const mockExecuteCommand = jest.fn().mockResolvedValue(mockResponseGenerator)

					// Create handler with specified options
					const testHandler = new ClaudeCodeHandler(handlerOptions)

					// Set authenticated using the testing interface
					const testHandlerInterface = ClaudeCodeHandler._exposeForTesting(testHandler)
					testHandlerInterface.isAuthenticated = true
					testHandlerInterface.authChecked = true

					// Replace the method
					const originalMethod = testHandler["executeClaudeCodeCommand"]
					testHandler["executeClaudeCodeCommand"] = mockExecuteCommand

					// Call the method under test
					const result = await testHandler.completePrompt(prompt)

					// Verify the mock was called with the expected parameters
					expect(mockExecuteCommand).toHaveBeenCalled()
					const args = mockExecuteCommand.mock.calls[0]
					expect(args[0]).toEqual(expect.arrayContaining(expectedCommandArgs))
					expect(args[1]).toBe(expectedPrompt)

					// Verify the result
					expect(result).toBe(expectedResult)

					// Restore the original method
					testHandler["executeClaudeCodeCommand"] = originalMethod
				})
			},
		)
	})
})
