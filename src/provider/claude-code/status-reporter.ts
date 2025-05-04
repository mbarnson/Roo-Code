import * as vscode from "vscode"
import { EventEmitter } from "events"

/**
 * Status levels for Claude Code status reports
 */
export enum StatusLevel {
	Info = "info",
	Warning = "warning",
	Error = "error",
	Success = "success",
}

/**
 * Interface for status message
 */
export interface StatusMessage {
	text: string
	level: StatusLevel
	timestamp: Date
}

/**
 * Events emitted by StatusReporter
 */
export enum StatusReporterEvent {
	StatusChanged = "statusChanged",
	MessageAdded = "messageAdded",
}

/**
 * Interface for status reporter options
 */
export interface StatusReporterOptions {
	/** Maximum number of messages to keep in history (default: 100) */
	maxMessages?: number
	/** Initial status (default: 'Idle') */
	initialStatus?: string
	/** Prefix to use for status bar and notifications (default: 'Claude Code') */
	statusPrefix?: string
}

/**
 * Interface for status reporter methods
 * This interface is needed to improve type safety when using the status reporter
 * across multiple components
 */
export interface IStatusReporter {
	/** Update the current status */
	updateStatus(status: string): void
	/** Show an error message */
	showError(error: Error): void
	/** Show an info message */
	showInfo(message: string): void
	/** Show a warning message */
	showWarning(message: string): void
	/** Show a success message */
	showSuccess(message: string): void
	/** Get all status messages */
	getMessages(): ReadonlyArray<StatusMessage>
	/** Get the current status text */
	getCurrentStatus(): string
	/** Clear all messages */
	clearMessages(): void
	/** Dispose resources */
	dispose(): void
}

/**
 * Status reporter for Claude Code provider
 * Reports status changes and messages to UI components
 */
export class StatusReporter extends EventEmitter implements IStatusReporter {
	private statusBarItem: vscode.StatusBarItem
	private currentStatus: string
	private messages: StatusMessage[] = []
	private maxMessages: number
	private statusPrefix: string

	/**
	 * Create a new StatusReporter instance
	 * @param options Options for the status reporter
	 */
	constructor(options?: StatusReporterOptions) {
		super()

		// Default options with explicit values
		this.maxMessages = 100
		this.currentStatus = "Idle"
		this.statusPrefix = "Claude Code"

		// Override with provided options if available
		if (options) {
			if (options.maxMessages !== undefined) {
				this.maxMessages = options.maxMessages
			}

			if (options.initialStatus !== undefined) {
				this.currentStatus = options.initialStatus
			}

			if (options.statusPrefix !== undefined) {
				this.statusPrefix = options.statusPrefix
			}
		}

		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
		this.updateStatusBarText()
		this.statusBarItem.show()
	}

	/**
	 * Update the status bar text with current status
	 */
	private updateStatusBarText(): void {
		this.statusBarItem.text = `${this.statusPrefix}: ${this.currentStatus}`
	}

	/**
	 * Update the current status
	 * @param status The new status text
	 */
	updateStatus(status: string): void {
		if (typeof status !== "string") {
			console.warn("StatusReporter.updateStatus called with non-string value:", status)
			status = String(status || "")
		}

		this.currentStatus = status
		this.updateStatusBarText()
		this.emit(StatusReporterEvent.StatusChanged, status)
	}

	/**
	 * Show an error message
	 * @param error The error to show
	 */
	showError(error: Error): void {
		if (!(error instanceof Error)) {
			console.warn("StatusReporter.showError called with non-Error value:", error)
			error = new Error(String(error || "Unknown error"))
		}

		const message: StatusMessage = {
			text: error.message,
			level: StatusLevel.Error,
			timestamp: new Date(),
		}

		this.addMessage(message)
		vscode.window.showErrorMessage(`${this.statusPrefix}: ${error.message}`)
	}

	/**
	 * Show an info message
	 * @param message The message to show
	 */
	showInfo(message: string): void {
		if (typeof message !== "string") {
			console.warn("StatusReporter.showInfo called with non-string value:", message)
			message = String(message || "")
		}

		const statusMessage: StatusMessage = {
			text: message,
			level: StatusLevel.Info,
			timestamp: new Date(),
		}

		this.addMessage(statusMessage)
	}

	/**
	 * Show a warning message
	 * @param message The message to show
	 */
	showWarning(message: string): void {
		if (typeof message !== "string") {
			console.warn("StatusReporter.showWarning called with non-string value:", message)
			message = String(message || "")
		}

		const statusMessage: StatusMessage = {
			text: message,
			level: StatusLevel.Warning,
			timestamp: new Date(),
		}

		this.addMessage(statusMessage)
		vscode.window.showWarningMessage(`${this.statusPrefix}: ${message}`)
	}

	/**
	 * Show a success message
	 * @param message The message to show
	 */
	showSuccess(message: string): void {
		if (typeof message !== "string") {
			console.warn("StatusReporter.showSuccess called with non-string value:", message)
			message = String(message || "")
		}

		const statusMessage: StatusMessage = {
			text: message,
			level: StatusLevel.Success,
			timestamp: new Date(),
		}

		this.addMessage(statusMessage)
		vscode.window.showInformationMessage(`${this.statusPrefix}: ${message}`)
	}

	/**
	 * Add a message to the message history
	 * @param message The message to add
	 */
	private addMessage(message: StatusMessage): void {
		if (!message || typeof message !== "object") {
			console.warn("StatusReporter.addMessage called with invalid message:", message)
			return
		}

		this.messages.unshift(message)

		// Limit the number of messages
		if (this.messages.length > this.maxMessages) {
			this.messages = this.messages.slice(0, this.maxMessages)
		}

		this.emit(StatusReporterEvent.MessageAdded, message)
	}

	/**
	 * Get all messages
	 * @returns A copy of the message history array
	 */
	getMessages(): ReadonlyArray<StatusMessage> {
		return [...this.messages]
	}

	/**
	 * Get the current status
	 * @returns The current status text
	 */
	getCurrentStatus(): string {
		return this.currentStatus
	}

	/**
	 * Clear all messages
	 */
	clearMessages(): void {
		this.messages = []
		this.emit(StatusReporterEvent.MessageAdded, null)
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.statusBarItem.dispose()
		this.removeAllListeners()
	}

	/**
	 * Create a new instance of StatusReporter
	 * @param options Options for the status reporter
	 * @returns A new StatusReporter instance
	 */
	static create(options?: StatusReporterOptions): StatusReporter {
		return new StatusReporter(options)
	}
}
