import * as vscode from "vscode"
import { StatusReporter, StatusReporterEvent } from "./provider/claude-code/status-reporter"

/**
 * Handler for Claude Code status messages to relay them to the webview
 */
export class StatusMessageHandler {
	private readonly statusReporter: StatusReporter
	private readonly webviewProvider?: vscode.WebviewView

	constructor(statusReporter: StatusReporter, webviewProvider?: vscode.WebviewView) {
		this.statusReporter = statusReporter
		this.webviewProvider = webviewProvider

		this.initialize()
	}

	/**
	 * Initialize event listeners
	 */
	private initialize(): void {
		// Listen for status changes
		this.statusReporter.on(StatusReporterEvent.StatusChanged, (status: string) => {
			this.relayStatusUpdate(status)
		})

		// Listen for message additions
		this.statusReporter.on(StatusReporterEvent.MessageAdded, (message: any) => {
			this.relayMessageAdded(message)
		})
	}

	/**
	 * Relay status update to webview
	 */
	private relayStatusUpdate(status: string): void {
		if (this.webviewProvider && this.webviewProvider.visible) {
			this.webviewProvider.webview.postMessage({
				type: "claudeCodeStatusUpdate",
				status,
			})
		}
	}

	/**
	 * Relay message added to webview
	 */
	private relayMessageAdded(message: any): void {
		if (this.webviewProvider && this.webviewProvider.visible) {
			this.webviewProvider.webview.postMessage({
				type: "claudeCodeMessageAdded",
				message,
			})
		}
	}

	/**
	 * Handle message from webview
	 */
	public handleWebviewMessage(message: any): void {
		if (message.type === "requestClaudeCodeStatus") {
			// Send current status
			this.relayStatusUpdate(this.statusReporter.getCurrentStatus())

			// Send all messages
			const messages = this.statusReporter.getMessages()
			messages.forEach((message) => {
				this.relayMessageAdded(message)
			})
		} else if (message.type === "clearClaudeCodeMessages") {
			this.statusReporter.clearMessages()
		}
	}

	/**
	 * Update webview provider reference
	 */
	public updateWebviewProvider(newWebviewProvider: vscode.WebviewView): void {
		// @ts-ignore - Adding ignore to allow updating readonly property for compatibility
		this.webviewProvider = newWebviewProvider
	}

	/**
	 * Dispose resources
	 */
	public dispose(): void {
		// Nothing to dispose as EventEmitter is handled by StatusReporter
	}
}
