import * as vscode from "vscode"
import { VsCodeIntegratedClaudeCode, createVsCodeIntegratedClaudeCode } from "../claude-code-vscode-integrated"
import { ClaudeCodeHandler } from "../claude-code"
import { DiffViewProvider } from "../../../integrations/editor/DiffViewProvider"
import { FileContextTracker } from "../../../core/context-tracking/FileContextTracker"
import { ClineProvider } from "../../../core/webview/ClineProvider"

// Mock dependencies
jest.mock("../claude-code")
jest.mock("../../../integrations/editor/DiffViewProvider")
jest.mock("../../../core/context-tracking/FileContextTracker")
jest.mock("vscode")

describe("VsCodeIntegratedClaudeCode", () => {
	let vsCodeIntegrated: VsCodeIntegratedClaudeCode
	let mockDiffViewProvider: jest.Mocked<DiffViewProvider>
	let mockFileContextTracker: jest.Mocked<FileContextTracker>
	let mockClineProvider: jest.Mocked<ClineProvider>

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Create mock instances
		mockDiffViewProvider = new DiffViewProvider("") as jest.Mocked<DiffViewProvider>
		mockClineProvider = {} as jest.Mocked<ClineProvider>
		mockFileContextTracker = new FileContextTracker(
			mockClineProvider,
			"test-task-id",
		) as jest.Mocked<FileContextTracker>

		// Mock workspace folders
		;(vscode.workspace.workspaceFolders as unknown) = [
			{
				uri: { fsPath: "/test/workspace" },
				name: "workspace",
				index: 0,
			},
		]

		// Set up VS Code integrated Claude Code
		vsCodeIntegrated = createVsCodeIntegratedClaudeCode(
			{
				claudeCodePath: "claude-code",
				claudeCodeModelId: "claude-3-sonnet-20240229",
				cwd: "/test/workspace",
			},
			mockDiffViewProvider,
			mockFileContextTracker,
		)
	})

	describe("createMessage", () => {
		it("should proxy to ClaudeCodeHandler.createMessage", async () => {
			// Setup mock implementation for ClaudeCodeHandler.createMessage with proper ApiStreamChunk types
			const mockStream = (async function* () {
				yield { type: "text" as const, text: "This is a response from Claude Code." }
				yield { type: "text" as const, text: "I've updated the file src/example.ts" }
			})()

			// Mock ClaudeCodeHandler constructor and createMessage method
			jest.mocked(ClaudeCodeHandler.prototype.createMessage).mockImplementation(
				(_systemPrompt, _messages) => mockStream,
			)

			// Mock vscode.window.withProgress
			jest.mocked(vscode.window.withProgress).mockImplementation((options, task) => {
				const progress = { report: jest.fn() }
				const token = { isCancellationRequested: false, onCancellationRequested: jest.fn() }
				task(progress, token)
				return Promise.resolve()
			})

			// Mock file detection and reading
			jest.mocked(vscode.workspace.fs.stat).mockResolvedValue({
				type: vscode.FileType.File,
			} as vscode.FileStat)

			jest.mocked(vscode.workspace.fs.readFile).mockResolvedValue(Buffer.from("// Example file content"))

			// Mock diffViewProvider
			mockDiffViewProvider.open = jest.fn().mockResolvedValue(undefined)
			mockDiffViewProvider.update = jest.fn().mockResolvedValue(undefined)
			mockDiffViewProvider.saveChanges = jest.fn().mockResolvedValue({
				newProblemsMessage: undefined,
				userEdits: undefined,
				finalContent: "// Example file content",
			})

			// Mock window.showInformationMessage with custom MessageItem
			jest.mocked(vscode.window.showInformationMessage).mockResolvedValue({
				title: "Keep Changes",
			} as vscode.MessageItem)

			// Execute createMessage
			const systemPrompt = "You are a helpful AI assistant."
			const messages = [{ role: "user" as const, content: "Hello" }]

			const stream = vsCodeIntegrated.createMessage(systemPrompt, messages)
			const results = []

			for await (const chunk of stream) {
				results.push(chunk)
			}

			// Verify results
			expect(results).toEqual([
				{ type: "text", text: "This is a response from Claude Code." },
				{ type: "text", text: "I've updated the file src/example.ts" },
			])

			// Verify that progress indicator was shown
			expect(vscode.window.withProgress).toHaveBeenCalled()

			// Check if file context tracking was done
			expect(mockFileContextTracker.trackFileContext).toHaveBeenCalled()
		})
	})

	describe("completePrompt", () => {
		it("should proxy to ClaudeCodeHandler.completePrompt", async () => {
			// Setup mock for ClaudeCodeHandler.completePrompt
			jest.mocked(ClaudeCodeHandler.prototype.completePrompt).mockResolvedValue("Completion result")

			// Mock vscode.window.withProgress
			jest.mocked(vscode.window.withProgress).mockImplementation((options, task) => {
				const progress = { report: jest.fn() }
				const token = { isCancellationRequested: false, onCancellationRequested: jest.fn() }
				task(progress, token)
				return Promise.resolve()
			})

			// Execute completePrompt
			const result = await vsCodeIntegrated.completePrompt("Complete this code:")

			// Verify result
			expect(result).toBe("Completion result")

			// Verify that progress indicator was shown
			expect(vscode.window.withProgress).toHaveBeenCalled()
		})
	})

	describe("getModel", () => {
		it("should proxy to ClaudeCodeHandler.getModel", () => {
			const mockModel = {
				id: "claude-3-sonnet-20240229",
				info: {
					maxTokens: 4096,
					contextWindow: 200000,
					supportsImages: true,
					supportsPromptCache: false,
					supportsComputerUse: true,
					inputPrice: 3,
					outputPrice: 15,
					description: "Claude 3 Sonnet - Balance of intelligence and speed",
				},
			}

			// Setup mock for ClaudeCodeHandler.getModel
			jest.mocked(ClaudeCodeHandler.prototype.getModel).mockReturnValue(mockModel)

			// Execute getModel
			const model = vsCodeIntegrated.getModel()

			// Verify result
			expect(model).toEqual(mockModel)
		})
	})

	describe("File detection and handling", () => {
		it("should detect and handle file modifications", async () => {
			// Setup mock implementation for ClaudeCodeHandler.createMessage with proper ApiStreamChunk types
			const mockStream = (async function* () {
				yield {
					type: "text" as const,
					text: "I've created a new file src/example.ts with the following content:",
				}
				yield {
					type: "text" as const,
					text: "```typescript\nfunction hello() {\n  console.log('Hello world');\n}\n```",
				}
			})()

			jest.mocked(ClaudeCodeHandler.prototype.createMessage).mockImplementation(
				(_systemPrompt, _messages) => mockStream,
			)

			// Mock vscode.window.withProgress
			jest.mocked(vscode.window.withProgress).mockImplementation((options, task) => {
				const progress = { report: jest.fn() }
				const token = { isCancellationRequested: false, onCancellationRequested: jest.fn() }
				task(progress, token)
				return Promise.resolve()
			})

			// Mock file detection and reading
			jest.mocked(vscode.workspace.fs.stat).mockResolvedValue({
				type: vscode.FileType.File,
			} as vscode.FileStat)

			jest.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
				Buffer.from("function hello() {\n  console.log('Hello world');\n}"),
			)

			// Mock diffViewProvider
			mockDiffViewProvider.editType = "modify"
			mockDiffViewProvider.open = jest.fn().mockResolvedValue(undefined)
			mockDiffViewProvider.update = jest.fn().mockResolvedValue(undefined)
			mockDiffViewProvider.saveChanges = jest.fn().mockResolvedValue({
				newProblemsMessage: undefined,
				userEdits: undefined,
				finalContent: "function hello() {\n  console.log('Hello world');\n}",
			})

			// Mock window.showInformationMessage with custom MessageItem
			jest.mocked(vscode.window.showInformationMessage).mockResolvedValue({
				title: "Keep Changes",
			} as vscode.MessageItem)

			// Execute createMessage
			const systemPrompt = "You are a helpful AI assistant."
			const messages = [{ role: "user" as const, content: "Create a hello world function" }]

			const stream = vsCodeIntegrated.createMessage(systemPrompt, messages)
			const results = []

			for await (const chunk of stream) {
				results.push(chunk)
			}

			// Verify that file tracking was done
			expect(mockFileContextTracker.markFileAsEditedByRoo).toHaveBeenCalled()
			expect(mockFileContextTracker.trackFileContext).toHaveBeenCalledWith(
				expect.stringContaining("example.ts"),
				"roo_edited",
			)

			// Verify that diff view was used
			expect(mockDiffViewProvider.open).toHaveBeenCalled()
			expect(mockDiffViewProvider.update).toHaveBeenCalled()
			expect(vscode.window.showInformationMessage).toHaveBeenCalled()
		})
	})
})
