import type { PromptOptions } from "../common-types"
import {
	VsCodeIntegratedClaudeCode,
	VsCodeIntegratedClaudeCodeTestingInterface,
	_exposeForTesting,
} from "../claude-code-vscode"

// Mock dependencies
jest.mock("vscode", () => ({
	window: {
		createStatusBarItem: jest.fn().mockReturnValue({
			text: "",
			show: jest.fn(),
			dispose: jest.fn(),
		}),
		showErrorMessage: jest.fn(),
		showInformationMessage: jest.fn().mockResolvedValue("Apply Changes"),
		showWarningMessage: jest.fn().mockResolvedValue("Delete"),
		showTextDocument: jest.fn(),
		withProgress: jest.fn().mockImplementation((_, callback) =>
			callback(
				{
					report: jest.fn(),
				},
				{ onCancellationRequested: jest.fn() },
			),
		),
	},
	workspace: {
		fs: {
			readFile: jest.fn().mockResolvedValue(Buffer.from("original content")),
			writeFile: jest.fn().mockResolvedValue(undefined),
			delete: jest.fn().mockResolvedValue(undefined),
			rename: jest.fn().mockResolvedValue(undefined),
			createDirectory: jest.fn().mockResolvedValue(undefined),
			stat: jest.fn().mockResolvedValue({ type: 1 }),
		},
		openTextDocument: jest.fn().mockResolvedValue({
			getText: jest.fn().mockReturnValue("original content"),
			positionAt: jest.fn().mockReturnValue({ line: 0, character: 0 }),
		}),
		applyEdit: jest.fn().mockResolvedValue(true),
	},
	StatusBarAlignment: {
		Left: 1,
	},
	ProgressLocation: {
		Notification: 1,
	},
	Uri: {
		file: jest.fn((path) => ({ path })),
	},
	commands: {
		executeCommand: jest.fn(),
	},
	Range: class {
		constructor(
			public start: any,
			public end: any,
		) {}
	},
	Position: class {
		constructor(
			public line: number,
			public character: number,
		) {}
	},
	WorkspaceEdit: class {
		constructor() {}
		createFile = jest.fn()
		deleteFile = jest.fn()
		renameFile = jest.fn()
		insert = jest.fn()
		replace = jest.fn()
	},
}))

// Mock the ClaudeCodeHandler parent class
jest.mock("../claude-code", () => ({
	ClaudeCodeHandler: class {
		constructor() {}
		completePrompt = jest
			.fn()
			.mockResolvedValue(
				"Response with file operations\n\nwriting to file /test/file.js:\n```\nconst x = 1;\n```\n\nMore text.",
			)
	},
}))

describe("VsCodeIntegratedClaudeCode", () => {
	let claudeCode: VsCodeIntegratedClaudeCode
	let testingInterface: VsCodeIntegratedClaudeCodeTestingInterface

	beforeEach(() => {
		jest.clearAllMocks()

		// Create a real instance with mocked dependencies
		claudeCode = new VsCodeIntegratedClaudeCode({
			claudeCodeModelId: "claude-3-sonnet-20240229",
		})

		// Access the testing interface
		testingInterface = _exposeForTesting(claudeCode)

		// Mock the completePrompt method to avoid actual execution
		claudeCode.completePrompt = jest.fn().mockResolvedValue({
			content: "Mock response with file operations updated in VS Code",
		}) as any
	})

	describe("completePrompt", () => {
		it("should process file operations correctly", async () => {
			const options: PromptOptions = {
				prompt: "Test prompt",
				includeThinking: true,
				systemPrompt: "You are a helpful assistant",
			}

			const result = await claudeCode.completePrompt(options)

			// Verify the response contains the expected content
			expect(result.content).toContain("Mock response with file operations")
		})
	})

	describe("testParseFileOperations", () => {
		it("should parse file creation operations", () => {
			const response = "I've created a new file called `/tmp/example.js`:\n```js\nconsole.log('Hello');\n```"
			const operations = testingInterface.testParseFileOperations(response)

			expect(operations).toHaveLength(1)
			expect(operations[0]).toEqual({
				type: "create",
				path: "/tmp/example.js",
				content: "console.log('Hello');",
			})
		})

		it("should parse file update operations", () => {
			const response = "I've updated the file `/tmp/example.js`:\n```js\nconsole.log('Updated');\n```"
			const operations = testingInterface.testParseFileOperations(response)

			expect(operations).toHaveLength(1)
			expect(operations[0]).toEqual({
				type: "update",
				path: "/tmp/example.js",
				content: "console.log('Updated');",
			})
		})

		it("should parse file deletion operations", () => {
			const response = "I've deleted the file `/tmp/example.js`"
			const operations = testingInterface.testParseFileOperations(response)

			expect(operations).toHaveLength(1)
			expect(operations[0]).toEqual({
				type: "delete",
				path: "/tmp/example.js",
			})
		})

		it("should parse file rename operations", () => {
			const response = "I've renamed the file `/tmp/old.js` to `/tmp/new.js`"
			const operations = testingInterface.testParseFileOperations(response)

			expect(operations).toHaveLength(1)
			expect(operations[0]).toEqual({
				type: "rename",
				path: "/tmp/new.js",
				oldPath: "/tmp/old.js",
			})
		})
	})

	describe("testRemoveFileOperations", () => {
		it("should replace file creation notices with VS Code appropriate message", () => {
			const response = "I've created a new file called `/tmp/example.js`:\n```js\nconsole.log('Hello');\n```"
			const modified = testingInterface.testRemoveFileOperations(response)

			expect(modified).toContain("File /tmp/example.js has been created in VS Code")
			expect(modified).not.toContain("console.log('Hello');")
		})

		it("should replace file update notices with VS Code appropriate message", () => {
			const response = "I've updated the file `/tmp/example.js`:\n```js\nconsole.log('Updated');\n```"
			const modified = testingInterface.testRemoveFileOperations(response)

			expect(modified).toContain("File /tmp/example.js has been updated in VS Code")
			expect(modified).not.toContain("console.log('Updated');")
		})

		it("should replace file deletion notices with VS Code appropriate message", () => {
			const response = "I've deleted the file `/tmp/example.js`"
			const modified = testingInterface.testRemoveFileOperations(response)

			expect(modified).toContain("File /tmp/example.js has been deleted in VS Code")
		})

		it("should replace file rename notices with VS Code appropriate message", () => {
			const response = "I've renamed the file `/tmp/old.js` to `/tmp/new.js`"
			const modified = testingInterface.testRemoveFileOperations(response)

			expect(modified).toContain("File /tmp/old.js has been renamed to /tmp/new.js in VS Code")
		})
	})
})
