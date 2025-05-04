/**
 * Path utilities for Claude Code provider
 *
 * This module provides cross-platform path handling utilities for
 * the Claude Code provider integration with VS Code.
 */

import * as path from "path"
import * as os from "os"

/**
 * Helper to normalize file paths for cross-platform compatibility
 *
 * @param filePath - Path to normalize
 * @returns Normalized path
 */
export function normalizePath(filePath: string): string {
	if (!filePath) {
		return filePath
	}

	// Replace backslashes with forward slashes for cross-platform compatibility
	const normalizedPath = filePath.replace(/\\/g, "/")

	// Resolve any relative path segments
	return path.normalize(normalizedPath)
}

/**
 * Determine if the current platform is Windows
 *
 * @returns True if running on Windows, false otherwise
 */
export function isWindows(): boolean {
	return process.platform === "win32"
}

/**
 * Convert a path to use the appropriate separators for the current platform
 *
 * @param filePath - Path to convert
 * @returns Path with platform-appropriate separators
 */
export function toPlatformPath(filePath: string): string {
	if (!filePath) {
		return filePath
	}

	return isWindows() ? filePath.replace(/\//g, "\\") : filePath.replace(/\\/g, "/")
}

/**
 * Safely join path segments with proper handling for all platforms
 *
 * @param segments - Path segments to join
 * @returns Joined path with appropriate separators
 */
export function safeJoinPath(...segments: string[]): string {
	// Filter out empty segments and join
	const filteredSegments = segments.filter((segment) => segment && segment.trim().length > 0)

	// Handle empty path case
	if (filteredSegments.length === 0) {
		return ""
	}

	// Use path.join to handle platform-specific details
	return path.join(...filteredSegments)
}

/**
 * Get the extension of a file (including the dot)
 *
 * @param filePath - Path to get extension from
 * @returns File extension (e.g., ".txt") or empty string if none
 */
export function getFileExtension(filePath: string): string {
	if (!filePath) {
		return ""
	}

	const ext = path.extname(filePath)
	return ext
}

/**
 * Validate if a path is safe to use
 *
 * @param filePath - Path to validate
 * @returns True if the path is safe, false otherwise
 */
export function isPathSafe(filePath: string): boolean {
	if (!filePath) {
		return false
	}

	// Check for dangerous patterns
	const dangerousPatterns = [
		/[;&|<>$`"]/, // Shell metacharacters
		/\(\)/, // Command substitution
		/\s+/, // Spaces/whitespace
		/\.\./, // Path traversal
		/~/, // Home directory expansion
		/\/bin\//, // Direct path to system binaries
		/\/etc\//, // System configuration files
	]

	// If any dangerous pattern is found, the path is not safe
	return !dangerousPatterns.some((pattern) => pattern.test(filePath))
}

/**
 * Validate and normalize a path to the Claude Code CLI
 *
 * @param cliPath - Path to validate and normalize
 * @returns Safe, normalized CLI path
 */
export function validateCliPath(cliPath?: string): string {
	if (!cliPath) {
		return "claude-code" // Default executable name
	}

	// Trim whitespace
	const trimmedPath = cliPath.trim()

	// If empty after trimming, use default
	if (!trimmedPath) {
		return "claude-code"
	}

	// Check if the path is safe
	if (!isPathSafe(trimmedPath)) {
		console.warn(`Potentially unsafe CLI path: "${trimmedPath}". Using default instead.`)
		return "claude-code"
	}

	// For Windows, check if the path includes .exe extension
	if (isWindows() && !trimmedPath.endsWith(".exe") && !trimmedPath.includes("\\") && !trimmedPath.includes("/")) {
		// If it's just a command name without path separators, ensure .exe is appended
		return `${trimmedPath}.exe`
	}

	return trimmedPath
}

/**
 * Get the home directory path
 *
 * @returns Home directory path
 */
export function getHomeDir(): string {
	return os.homedir()
}

/**
 * Resolve a path relative to the home directory
 *
 * @param relativePath - Path relative to home directory
 * @returns Absolute path from home directory
 */
export function resolveHomeDir(relativePath: string): string {
	if (!relativePath) {
		return getHomeDir()
	}

	// Replace ~ with actual home directory
	if (relativePath.startsWith("~")) {
		return path.join(getHomeDir(), relativePath.substring(1))
	}

	return relativePath
}

/**
 * Get the directory path from a file path
 *
 * @param filePath - Path to get directory from
 * @returns Directory path
 */
export function getDirPath(filePath: string): string {
	if (!filePath) {
		return ""
	}

	return path.dirname(filePath)
}

/**
 * Get the file name from a path
 *
 * @param filePath - Path to get file name from
 * @returns File name
 */
export function getFileName(filePath: string): string {
	if (!filePath) {
		return ""
	}

	return path.basename(filePath)
}

/**
 * Resolve a relative path against a base path
 *
 * @param basePath - Base path to resolve against
 * @param relativePath - Relative path to resolve
 * @returns Resolved absolute path
 */
export function resolveRelativePath(basePath: string, relativePath: string): string {
	if (!basePath || !relativePath) {
		return relativePath || basePath || ""
	}

	return path.resolve(basePath, relativePath)
}
