/**
 * Type definitions for Cline Provider integration
 */
import { ClineProvider } from "../../../core/webview/ClineProvider"
import { FileContextTracker } from "../../../core/context-tracking/FileContextTracker"

/**
 * Interface for safely interacting with ClineProvider
 */
export interface SafeClineProvider {
	/**
	 * Get the workspace tracker, which may be undefined
	 */
	workspaceTracker?: unknown

	/**
	 * Get the current Cline task ID, which may be undefined
	 */
	getCurrentCline?: () => { taskId?: string } | undefined
}

/**
 * Creates a FileContextTracker from a ClineProvider if possible
 *
 * @param clineProvider The ClineProvider instance to use
 * @returns A FileContextTracker instance or undefined if not possible
 */
export function createFileContextTracker(clineProvider: ClineProvider | undefined): FileContextTracker | undefined {
	if (!clineProvider) return undefined

	// Check if workspaceTracker exists
	if (!clineProvider.workspaceTracker) return undefined

	// Get the current task ID
	const currentCline = clineProvider.getCurrentCline?.()
	const taskId = currentCline?.taskId || ""

	// Create the file context tracker
	return new FileContextTracker(clineProvider, taskId)
}
