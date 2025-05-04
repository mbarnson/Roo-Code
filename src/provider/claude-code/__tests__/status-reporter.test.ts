import * as vscode from "vscode"
import {
	StatusReporter,
	StatusLevel,
	StatusReporterEvent,
	IStatusReporter,
	StatusReporterOptions,
} from "../status-reporter"

jest.mock("vscode", () => ({
	window: {
		createStatusBarItem: jest.fn().mockReturnValue({
			text: "",
			show: jest.fn(),
			dispose: jest.fn(),
		}),
		showErrorMessage: jest.fn(),
		showWarningMessage: jest.fn(),
		showInformationMessage: jest.fn(),
	},
	StatusBarAlignment: {
		Left: 1,
	},
}))

describe("StatusReporter", () => {
	let reporter: IStatusReporter

	beforeEach(() => {
		jest.clearAllMocks()
		reporter = StatusReporter.create()
	})

	describe("constructor", () => {
		it("should use default options if none are provided", () => {
			const reporter = new StatusReporter()
			expect(reporter.getCurrentStatus()).toBe("Idle")
		})

		it("should use provided options", () => {
			const options: StatusReporterOptions = {
				maxMessages: 50,
				initialStatus: "Testing",
				statusPrefix: "Test Reporter",
			}

			const reporter = new StatusReporter(options)
			expect(reporter.getCurrentStatus()).toBe("Testing")

			// Verify prefix is used by triggering a message
			reporter.showInfo("Test")
			expect(vscode.window.createStatusBarItem).toHaveBeenCalled()
		})
	})

	describe("updateStatus", () => {
		it("should update the status and emit event", () => {
			const emitSpy = jest.spyOn(reporter, "emit" as any)

			reporter.updateStatus("Working")

			expect(emitSpy).toHaveBeenCalledWith(StatusReporterEvent.StatusChanged, "Working")
			expect(reporter.getCurrentStatus()).toBe("Working")
		})

		it("should handle non-string status values", () => {
			const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation()
			// @ts-expect-error Testing invalid input type
			reporter.updateStatus(null)

			expect(consoleWarnSpy).toHaveBeenCalled()
			expect(reporter.getCurrentStatus()).toBe("")

			consoleWarnSpy.mockRestore()
		})
	})

	describe("showError", () => {
		it("should show error and add message", () => {
			const emitSpy = jest.spyOn(reporter, "emit" as any)
			const error = new Error("Test error")

			reporter.showError(error)

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Test error"))
			expect(emitSpy).toHaveBeenCalledWith(
				StatusReporterEvent.MessageAdded,
				expect.objectContaining({
					text: "Test error",
					level: StatusLevel.Error,
				}),
			)

			const messages = reporter.getMessages()
			expect(messages[0].text).toBe("Test error")
			expect(messages[0].level).toBe(StatusLevel.Error)
		})

		it("should handle non-Error error values", () => {
			const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation()
			// @ts-expect-error Testing invalid input type
			reporter.showError("This is not an Error")

			expect(consoleWarnSpy).toHaveBeenCalled()
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("This is not an Error"))

			const messages = reporter.getMessages()
			expect(messages[0].text).toBe("This is not an Error")
			expect(messages[0].level).toBe(StatusLevel.Error)

			consoleWarnSpy.mockRestore()
		})
	})

	describe("showInfo", () => {
		it("should add info message", () => {
			const emitSpy = jest.spyOn(reporter, "emit" as any)

			reporter.showInfo("Info message")

			expect(emitSpy).toHaveBeenCalledWith(
				StatusReporterEvent.MessageAdded,
				expect.objectContaining({
					text: "Info message",
					level: StatusLevel.Info,
				}),
			)

			const messages = reporter.getMessages()
			expect(messages[0].text).toBe("Info message")
			expect(messages[0].level).toBe(StatusLevel.Info)
		})

		it("should handle non-string message values", () => {
			const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation()
			// @ts-expect-error Testing invalid input type
			reporter.showInfo({ invalid: "object" })

			expect(consoleWarnSpy).toHaveBeenCalled()

			consoleWarnSpy.mockRestore()
		})
	})

	describe("showWarning", () => {
		it("should show warning and add message", () => {
			const emitSpy = jest.spyOn(reporter, "emit" as any)

			reporter.showWarning("Warning message")

			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining("Warning message"))
			expect(emitSpy).toHaveBeenCalledWith(
				StatusReporterEvent.MessageAdded,
				expect.objectContaining({
					text: "Warning message",
					level: StatusLevel.Warning,
				}),
			)

			const messages = reporter.getMessages()
			expect(messages[0].text).toBe("Warning message")
			expect(messages[0].level).toBe(StatusLevel.Warning)
		})

		it("should handle non-string warning values", () => {
			const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation()
			// @ts-expect-error Testing invalid input type
			reporter.showWarning(null)

			expect(consoleWarnSpy).toHaveBeenCalled()
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining(""))

			consoleWarnSpy.mockRestore()
		})
	})

	describe("showSuccess", () => {
		it("should show success message and add message", () => {
			const emitSpy = jest.spyOn(reporter, "emit" as any)

			reporter.showSuccess("Success message")

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("Success message"),
			)
			expect(emitSpy).toHaveBeenCalledWith(
				StatusReporterEvent.MessageAdded,
				expect.objectContaining({
					text: "Success message",
					level: StatusLevel.Success,
				}),
			)

			const messages = reporter.getMessages()
			expect(messages[0].text).toBe("Success message")
			expect(messages[0].level).toBe(StatusLevel.Success)
		})

		it("should handle non-string success values", () => {
			const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation()
			// @ts-expect-error Testing invalid input type
			reporter.showSuccess(undefined)

			expect(consoleWarnSpy).toHaveBeenCalled()
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining(""))

			consoleWarnSpy.mockRestore()
		})
	})

	describe("message management", () => {
		it("should limit the number of messages", () => {
			const reporter = new StatusReporter({ maxMessages: 10 })

			// Add more messages than the limit
			for (let i = 0; i < 15; i++) {
				reporter.showInfo(`Message ${i}`)
			}

			const messages = reporter.getMessages()
			expect(messages.length).toBe(10)
			expect(messages[0].text).toBe("Message 14") // Most recent should be first
		})

		it("should handle invalid messages", () => {
			const reporter = new StatusReporter()
			jest.spyOn(reporter as any, "addMessage")
			const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation()

			// @ts-ignore - Testing internal method with invalid input
			;(reporter as any).addMessage(null)

			expect(consoleWarnSpy).toHaveBeenCalled()
			expect(reporter.getMessages().length).toBe(0)

			consoleWarnSpy.mockRestore()
		})

		it("should clear messages", () => {
			reporter.showInfo("Test message")
			expect(reporter.getMessages().length).toBe(1)

			const emitSpy = jest.spyOn(reporter, "emit" as any)
			reporter.clearMessages()

			expect(reporter.getMessages().length).toBe(0)
			expect(emitSpy).toHaveBeenCalledWith(StatusReporterEvent.MessageAdded, null)
		})

		it("should return a copy of messages that doesnt affect original", () => {
			reporter.showInfo("Test message")
			const messages = reporter.getMessages()

			// Verify that modifying the returned array doesn't affect the original
			messages.length = 0

			expect(reporter.getMessages().length).toBe(1)
		})
	})

	describe("dispose", () => {
		it("should dispose resources and remove listeners", () => {
			const removeAllListenersSpy = jest.spyOn(reporter, "removeAllListeners" as any)

			reporter.dispose()

			expect(removeAllListenersSpy).toHaveBeenCalled()
		})
	})

	describe("create", () => {
		it("should create a new instance of StatusReporter", () => {
			const reporter = StatusReporter.create()
			expect(reporter).toBeInstanceOf(StatusReporter)
		})

		it("should create reporter with custom options", () => {
			const options: StatusReporterOptions = {
				initialStatus: "Custom",
				maxMessages: 5,
				statusPrefix: "Test",
			}

			const reporter = StatusReporter.create(options)
			expect(reporter.getCurrentStatus()).toBe("Custom")
		})
	})
})
