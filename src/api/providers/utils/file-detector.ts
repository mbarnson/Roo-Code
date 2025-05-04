import * as path from "path"

/**
 * Utility class for detecting file operations in text
 */
export class FileDetector {
	/**
	 * Creates a new FileDetector
	 *
	 * @param cwd Current working directory to resolve relative paths
	 */
	constructor(private cwd: string) {}

	/**
	 * Detect file paths mentioned in text
	 *
	 * @param text Text to scan for file paths
	 * @returns Array of detected absolute file paths
	 */
	detectFilePaths(text: string): string[] {
		if (!text) return []

		// Store unique paths
		const uniquePaths = new Set<string>()

		// Pattern 1: Standard file paths with extensions
		const filePathRegex = /(?:^|\s)([./\\]?[\w-]+(?:[./\\][\w-]+)+\.\w+)/g
		const matches = Array.from(text.matchAll(filePathRegex))

		// Process standard file paths
		matches
			.map((match) => match[1])
			.filter(Boolean)
			.forEach((path) => uniquePaths.add(path))

		// Pattern 2: Paths in backticks, quotes or code markup
		const quotedPathRegex = /[`'"]([./\\]?[\w-]+(?:[./\\][\w-]+)+\.\w+)[`'"]/g
		const quotedMatches = Array.from(text.matchAll(quotedPathRegex))

		quotedMatches
			.map((match) => match[1])
			.filter(Boolean)
			.forEach((path) => uniquePaths.add(path))

		// Pattern 3: File paths in common references
		const fileReferenceRegex = /(?:file|in|at|to|from|path):\s*([./\\]?[\w-]+(?:[./\\][\w-]+)+\.\w+)/gi
		const refMatches = Array.from(text.matchAll(fileReferenceRegex))

		refMatches
			.map((match) => match[1])
			.filter(Boolean)
			.forEach((path) => uniquePaths.add(path))

		// Pattern 4: Paths in markdown-style links
		const markdownLinkRegex = /\[.*?\]\(([./\\]?[\w-]+(?:[./\\][\w-]+)+\.\w+)\)/g
		const mdMatches = Array.from(text.matchAll(markdownLinkRegex))

		mdMatches
			.map((match) => match[1])
			.filter(Boolean)
			.forEach((path) => uniquePaths.add(path))

		// Pattern 5: File paths in Claude Code's file operations
		const claudeCodeFileOps = [
			/(?:file|updating|reading|created|modified|writing to) (\S+\.\w+)/gi,
			/open (?:file |)(\S+\.\w+)/gi,
		]

		for (const pattern of claudeCodeFileOps) {
			const matches = Array.from(text.matchAll(pattern))
			matches
				.map((match) => match[1])
				.filter(Boolean)
				.forEach((path) => uniquePaths.add(path))
		}

		// Convert to absolute paths and return
		return Array.from(uniquePaths).map((filePath) => this.resolveAbsolutePath(filePath))
	}

	/**
	 * Detect file modifications in text using heuristic patterns
	 *
	 * @param text Text to scan for file modifications
	 * @param existingModifications Optional map to accumulate results
	 * @returns Map of file paths to original paths
	 */
	detectFileModifications(text: string, existingModifications: Map<string, string> = new Map()): Map<string, string> {
		if (!text) return existingModifications

		// Common patterns indicating file modifications
		const fileModificationPatterns = [
			// Claude Code CLI specific patterns
			/writing to file\s+([^\s]+)\s*:/i,
			/deleting file\s+([^\s]+)/i,
			/renaming file\s+([^\s]+)\s+to\s+([^\s]+)/i,
			/created file\s+([^\s]+)/i,
			/updated file\s+([^\s]+)/i,
			/I've modified `([^`]+)`/i,
			/I'll create a new file at `([^`]+)`/i,
			/Let me create a file at `([^`]+)`/i,
			/let's create a file called `([^`]+)`/i,

			// Natural language patterns
			/I've (updated|created|modified|written) (?:the file|file) (?:at |)(?:'|"|`|)?([\w/\\.-]+)(?:'|"|`|)?/i,
			/I've applied the changes to (?:'|"|`|)?([\w/\\.-]+)(?:'|"|`|)?/i,
			/I've created a new file (?:at |)(?:'|"|`|)?([\w/\\.-]+)(?:'|"|`|)?/i,
			/File (?:created|updated|modified): (?:'|"|`|)?([\w/\\.-]+)(?:'|"|`|)?/i,
			/Created (?:a |)new file (?:at |in |)(?:'|"|`|)?([\w/\\.-]+)(?:'|"|`|)?/i,
			/Modified (?:file |)(?:'|"|`|)?([\w/\\.-]+)(?:'|"|`|)?/i,
			/I'll (?:now |)(?:create|write|generate)(?: a file| the file)? (?:at |)(?:'|"|`|)?([\w/\\.-]+)(?:'|"|`|)?/i,
			/(?:Here's|I've created) the complete (?:code|content) for (?:'|"|`|)?([\w/\\.-]+)(?:'|"|`|)?/i,

			// Code block with file header
			/```(?:\w+)?\s+(?:\/\/|#)\s+([^\s]+)\s*\n/i,
		]

		// Process each pattern
		for (const pattern of fileModificationPatterns) {
			const matches = text.matchAll(pattern)
			for (const match of matches) {
				// Standard pattern with one file path
				let filePath = match[1]

				// Handle patterns with multiple captures (e.g., file renames)
				// The rename pattern has source at index 1 and destination at index 2
				if (pattern.toString().includes("renaming file") && match[2]) {
					filePath = match[2] // Use the destination path

					// Also store the source path (we're handling a rename operation)
					const sourcePath = match[1]
					if (sourcePath) {
						const absoluteSourcePath = this.resolveAbsolutePath(sourcePath)
						existingModifications.set(absoluteSourcePath, sourcePath)
					}
				}

				// For patterns with the operation in the first capture group
				if (pattern.toString().includes("updated|created|modified|written") && match[2]) {
					filePath = match[2]
				}

				if (filePath) {
					const absolutePath = this.resolveAbsolutePath(filePath)
					if (!existingModifications.has(absolutePath)) {
						existingModifications.set(absolutePath, filePath)
					}
				}
			}
		}

		// Special handling for code blocks with content
		// Look for code blocks that might be file content
		const codeBlockRegex = /```(?:\w+)?\s*(?:\/\/|#)\s*([^\n]+)\s*\n([\s\S]*?)```/g
		const codeBlocks = Array.from(text.matchAll(codeBlockRegex))

		for (const codeBlock of codeBlocks) {
			const possibleFilePath = codeBlock[1].trim()
			// Skip obvious non-file paths (e.g., "Output", "Result", etc.)
			if (!/^(output|result|example|log|console)/i.test(possibleFilePath)) {
				// Looks like a file path
				let filePath = possibleFilePath

				// Clean up the file path if it has comments or annotations
				filePath = filePath.replace(/^(?:\/\/|#|\*)\s*/, "")

				if (filePath && /\.\w+$/.test(filePath)) {
					// Has file extension
					const absolutePath = this.resolveAbsolutePath(filePath)
					if (!existingModifications.has(absolutePath)) {
						existingModifications.set(absolutePath, filePath)
					}
				}
			}
		}

		return existingModifications
	}

	/**
	 * Resolves a path to an absolute path
	 *
	 * @param filePath Path to resolve
	 * @returns Absolute path
	 */
	private resolveAbsolutePath(filePath: string): string {
		return path.isAbsolute(filePath) ? filePath : path.resolve(this.cwd, filePath)
	}
}
