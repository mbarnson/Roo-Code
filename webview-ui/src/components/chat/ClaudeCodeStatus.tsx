import React, { useEffect, useState } from "react"
import { Badge } from "../../components/ui/badge"
import { useAppTranslation } from "../../i18n/TranslationContext"
import { vscode } from "../../utils/vscode"

// Status levels for Claude Code status
export enum StatusLevel {
	Info = "info",
	Warning = "warning",
	Error = "error",
	Success = "success",
}

// Interface for status message
export interface StatusMessage {
	text: string
	level: StatusLevel
	timestamp: Date
}

// Interface for message event data
interface ClaudeCodeStatusUpdate {
	type: "claudeCodeStatusUpdate"
	status: string
}

interface ClaudeCodeMessageAdded {
	type: "claudeCodeMessageAdded"
	message: StatusMessage
}

type VSCodeMessage = ClaudeCodeStatusUpdate | ClaudeCodeMessageAdded | { type: string }

/**
 * Component that displays the current status of Claude Code operations
 * and recent status messages
 */
export const ClaudeCodeStatus: React.FC = () => {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { t } = useAppTranslation()
	const [status, setStatus] = useState<string>("Idle")
	const [messages, setMessages] = useState<StatusMessage[]>([])
	const [expanded, setExpanded] = useState<boolean>(false)

	// Listen for status updates from the extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent<VSCodeMessage>) => {
			const message = event.data

			if (message.type === "claudeCodeStatusUpdate") {
				setStatus((message as ClaudeCodeStatusUpdate).status)
			}

			if (message.type === "claudeCodeMessageAdded") {
				const newMessage = (message as ClaudeCodeMessageAdded).message
				setMessages((prevMessages) => [newMessage, ...prevMessages.slice(0, 9)])
			}
		}

		window.addEventListener("message", handleMessage as EventListener)

		// Request current status and messages on mount
		vscode.postMessage({ type: "requestClaudeCodeStatus" })

		return () => {
			window.removeEventListener("message", handleMessage as EventListener)
		}
	}, [])

	// Get the appropriate color for a status level
	const getStatusColor = (level: StatusLevel): string => {
		switch (level) {
			case StatusLevel.Info:
				return "bg-blue-500"
			case StatusLevel.Warning:
				return "bg-yellow-500"
			case StatusLevel.Error:
				return "bg-red-500"
			case StatusLevel.Success:
				return "bg-green-500"
			default:
				return "bg-gray-500"
		}
	}

	// Get the status color based on current status
	const getStatusBadgeClass = (): string => {
		if (status.includes("Error")) {
			return "bg-red-500"
		}

		if (status.includes("Working")) {
			return "bg-blue-500 animate-pulse"
		}

		if (status.includes("Success")) {
			return "bg-green-500"
		}

		return "bg-gray-500"
	}

	// Format timestamp
	const formatTime = (timestamp: Date): string => {
		return new Date(timestamp).toLocaleTimeString()
	}

	return (
		<div className="claude-code-status p-2 border-t border-vscode-panel-border">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Badge className={getStatusBadgeClass()}>Claude Code: {status}</Badge>
					{messages.length > 0 && (
						<button
							className="text-xs text-vscode-descriptionForeground hover:text-vscode-foreground"
							onClick={() => setExpanded(!expanded)}>
							{expanded ? "Hide messages" : "Show messages"}
						</button>
					)}
				</div>

				{messages.length > 0 && (
					<button
						className="text-xs text-vscode-descriptionForeground hover:text-vscode-foreground"
						onClick={() => vscode.postMessage({ type: "clearClaudeCodeMessages" })}>
						Clear
					</button>
				)}
			</div>

			{expanded && messages.length > 0 && (
				<div className="mt-2 text-sm max-h-40 overflow-y-auto">
					{messages.map((message, index) => (
						<div
							key={index}
							className="flex items-start py-1 border-b border-vscode-panel-border last:border-0">
							<Badge className={`mr-2 shrink-0 ${getStatusColor(message.level)}`}>{message.level}</Badge>
							<div className="flex-1 overflow-hidden overflow-ellipsis">{message.text}</div>
							<div className="text-xs text-vscode-descriptionForeground ml-2 shrink-0">
								{formatTime(message.timestamp)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export default ClaudeCodeStatus
