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

		// Define a more robust base pattern for file paths that handles:
		// - Various path formats (relative, absolute)
		// - Common naming patterns (kebab-case, snake_case, dot.notation)
		// - Unicode characters in filenames (where supported)
		// - Spaces in paths (when quoted)

		// Allowed characters in filenames and paths
		const nameChars = String.raw`[\w\-\.~!@#%&=\+]` // Basic filename characters
		const pathSeparators = String.raw`[/\\]` // Path separators (/ and \)
		const extensions = String.raw`\.\w{1,10}` // File extensions (.xxx)

		// Patterns for finding file paths

		// Pattern 1: Standard file paths with extensions - improved to handle more cases
		// This matches more path formats such as ./path/file.ext, ~/user/file.ext, and absolute paths
		const filePathRegex = new RegExp(
			String.raw`(?:^|\s|=|:)([~.]?(?:${pathSeparators})?(?:${nameChars}+${pathSeparators})*${nameChars}+${extensions})`,
			"g",
		)
		const matches = Array.from(text.matchAll(filePathRegex))

		// Process standard file paths
		matches
			.map((match) => match[1])
			.filter(Boolean)
			.forEach((path) => uniquePaths.add(path))

		// Pattern 2: Paths in backticks, quotes or code markup - enhanced to handle spaces
		// This handles quoted paths which may contain spaces
		const quotedPathRegex = new RegExp(
			String.raw`['"\`]([~.]?(?:${pathSeparators})?(?:${nameChars}+(?:\s*)${pathSeparators})*${nameChars}+${extensions})['"\`]`,
			"g",
		)
		const quotedMatches = Array.from(text.matchAll(quotedPathRegex))

		quotedMatches
			.map((match) => match[1])
			.filter(Boolean)
			.forEach((path) => uniquePaths.add(path))

		// Pattern 3: File paths in common textual references
		// This catches phrases like "file: path/to/file.js" or "saved to path/to/file.js"
		const fileReferenceWords = [
			"file",
			"in",
			"at",
			"to",
			"from",
			"path",
			"open",
			"save",
			"write",
			"read",
			"create",
			"edit",
			"update",
			"check",
			"look at",
			"saved",
			"created",
			"written",
			"located",
		].join("|")

		const fileReferenceRegex = new RegExp(
			String.raw`(?:${fileReferenceWords})(?:\s+(?:in|to|at|the|file|path))?[\s:]+(['"\`]?)([~.]?(?:${pathSeparators})?(?:${nameChars}+(?:\s*)${pathSeparators})*${nameChars}+${extensions})\1`,
			"gi",
		)
		const refMatches = Array.from(text.matchAll(fileReferenceRegex))

		refMatches
			.map((match) => match[2]) // Capture group 2 has the path
			.filter(Boolean)
			.forEach((path) => uniquePaths.add(path))

		// Pattern 4: Paths in markdown-style links - with improved path detection
		const markdownLinkRegex = new RegExp(
			String.raw`\[(?:.*?)\]\(([~.]?(?:${pathSeparators})?(?:${nameChars}+${pathSeparators})*${nameChars}+${extensions})\)`,
			"g",
		)
		const mdMatches = Array.from(text.matchAll(markdownLinkRegex))

		mdMatches
			.map((match) => match[1])
			.filter(Boolean)
			.forEach((path) => uniquePaths.add(path))

		// Pattern 5: File paths in Claude Code's specific file operation phrases
		// This detects patterns specific to Claude Code's output format
		const claudeCodePhrases = [
			"updating",
			"reading",
			"created",
			"modified",
			"writing to",
			"saved",
			"generated",
			"examining",
			"analyzing",
			"opened",
			"changed",
			"deleted",
			"renamed",
			"copied",
			"moved",
		].join("|")

		const claudeCodeFileOps = [
			new RegExp(
				String.raw`(?:${claudeCodePhrases})\s+(?:the\s+)?(?:file\s+)?(['"\`]?)([~.]?(?:${pathSeparators})?(?:${nameChars}+(?:\s*)${pathSeparators})*${nameChars}+${extensions})\1`,
				"gi",
			),
			new RegExp(
				String.raw`open\s+(?:file\s+)?(['"\`]?)([~.]?(?:${pathSeparators})?(?:${nameChars}+(?:\s*)${pathSeparators})*${nameChars}+${extensions})\1`,
				"gi",
			),
		]

		for (const pattern of claudeCodeFileOps) {
			const matches = Array.from(text.matchAll(pattern))
			matches
				.map((match) => match[2]) // The path is in capture group 2
				.filter(Boolean)
				.forEach((path) => uniquePaths.add(path))
		}

		// Filter out false positives that might be common variable names or generic references
		const filtersRegex = /^(output|example|console|result|test|this|here)$/i
		const filteredPaths = Array.from(uniquePaths).filter((path) => !filtersRegex.test(path))

		// Convert to absolute paths and return
		return filteredPaths.map((filePath) => this.resolveAbsolutePath(filePath))
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

		// Define reusable pattern components for better maintenance and readability
		const nameChars = String.raw`[\w\-\.~!@#%&=\+]` // Basic filename characters
		const pathSeparators = String.raw`[/\\]` // Path separators (/ and \)
		const extensions = String.raw`\.\w{1,10}` // File extensions (.xxx)
		const pathPattern = String.raw`([~.]?(?:${pathSeparators})?(?:${nameChars}+(?:\s*)${pathSeparators})*${nameChars}+${extensions})`
		const quotedPathPattern = String.raw`(['"\`]?)${pathPattern}\1`

		// Group patterns by category for better organization

		// 1. Claude Code CLI specific output patterns
		const cliPatterns = [
			// Direct reports from Claude Code CLI
			new RegExp(String.raw`writing to file\s+${quotedPathPattern}\s*:`, "ig"),
			new RegExp(String.raw`created file\s+${quotedPathPattern}`, "ig"),
			new RegExp(String.raw`updated file\s+${quotedPathPattern}`, "ig"),
			new RegExp(String.raw`deleting file\s+${quotedPathPattern}`, "ig"),
			// Rename operations (special case with two paths)
			new RegExp(String.raw`renaming file\s+${quotedPathPattern}\s+to\s+${quotedPathPattern}`, "ig"),
		]

		// 2. Natural language patterns that indicate file modifications
		const verbs = [
			"updated",
			"created",
			"modified",
			"written",
			"edited",
			"changed",
			"saved",
			"generated",
			"wrote to",
			"made changes to",
		].join("|")

		const futureVerbs = ["create", "write", "generate", "save", "modify", "update", "edit", "make"].join("|")

		const naturalLanguagePatterns = [
			// Past tense patterns
			new RegExp(
				String.raw`I(?:'ve| have) (${verbs}) (?:the file|file|a file|code in|changes to) (?:at |in |to |)${quotedPathPattern}`,
				"ig",
			),
			new RegExp(String.raw`I(?:'ve| have) applied the changes to ${quotedPathPattern}`, "ig"),
			new RegExp(String.raw`(?:File|Changes) (?:${verbs}): ${quotedPathPattern}`, "ig"),
			new RegExp(
				String.raw`(?:I've|I have|I've just|I just) (?:completed|finished) (?:creating|modifying|updating|writing) ${quotedPathPattern}`,
				"ig",
			),
			new RegExp(String.raw`(?:The file|File) ${quotedPathPattern} has been (?:${verbs})`, "ig"),

			// Future/present tense patterns
			new RegExp(
				String.raw`I(?:'ll| will|'m going to) (?:now |)(?:${futureVerbs})(?: a file| the file| changes to| code in)? (?:at |in |to |)${quotedPathPattern}`,
				"ig",
			),
			new RegExp(
				String.raw`Let(?:'s| us) (?:${futureVerbs})(?: a file| the file| changes to)? (?:at |in |to |called |named |)${quotedPathPattern}`,
				"ig",
			),

			// Code content patterns
			new RegExp(
				String.raw`(?:Here's|I've created|Here is) the (?:complete |)(?:code|content|implementation) for ${quotedPathPattern}`,
				"ig",
			),
			new RegExp(
				String.raw`This is the (?:updated|new|complete|modified) (?:code|content|implementation) for ${quotedPathPattern}`,
				"ig",
			),
		]

		// 3. Code formatting patterns (markdown, comments)
		const codeFormattingPatterns = [
			// Markdown code blocks with filename headers
			new RegExp(String.raw`\`\`\`(?:\w+)?\s*(?:\/\/|#)\s*(${pathPattern})\s*\n([\s\S]*?)\`\`\``, "g"),
			// File content delimiters
			new RegExp(String.raw`(?:File:(?:\s+|:)|Content of ${quotedPathPattern}:)\s*\n`, "ig"),
			// File as title + code block pattern
			new RegExp(String.raw`## (?:File: |)${quotedPathPattern}\s*\n+\`\`\``, "ig"),
		]

		// Combine all patterns for processing
		const fileModificationPatterns = [...cliPatterns, ...naturalLanguagePatterns, ...codeFormattingPatterns]

		// Process each pattern
		for (const pattern of fileModificationPatterns) {
			const patternString = pattern.toString()
			const matches = text.matchAll(pattern)

			for (const match of matches) {
				let filePath: string | null = null
				let sourcePath: string | null = null

				// Handle rename operation with source and destination paths
				if (patternString.includes("renaming file") && match[3]) {
					sourcePath = match[2] // Source path is in group 2
					filePath = match[5] // Destination path is in group 5
				}
				// Handle patterns with verb in first capture group
				else if (patternString.includes(`(${verbs})`) && match[2]) {
					filePath = match[2]
				}
				// Handle code block patterns which may have the path in a different position
				else if (patternString.includes("```")) {
					filePath = match[1]?.trim()
				}
				// Standard patterns with path in group 2 or 3 (depending on quoted or not)
				else if (match[2]) {
					filePath = match[2]
				} else if (match[3]) {
					filePath = match[3]
				} else {
					filePath = match[1] // Fallback to first group
				}

				// Process source path if this is a rename operation
				if (sourcePath) {
					const absoluteSourcePath = this.resolveAbsolutePath(sourcePath)
					existingModifications.set(absoluteSourcePath, sourcePath)
				}

				// Process target file path
				if (filePath) {
					// Clean up file path by removing any comment markers
					filePath = filePath.replace(/^(?:\/\/|#|\*)\s*/, "")

					// Only process if it looks like a file path (has extension)
					if (/\.\w+$/.test(filePath)) {
						const absolutePath = this.resolveAbsolutePath(filePath)

						// Skip if it's already in the modifications map
						if (!existingModifications.has(absolutePath)) {
							existingModifications.set(absolutePath, filePath)
						}
					}
				}
			}
		}

		// Special handling for code blocks with content - improved to handle more formats
		const codeBlockRegex = /```(?:(\w+))?\s*(?:\/\/|#|File:)?\s*([^\n]+)?\s*\n([\s\S]*?)```/g
		const codeBlocks = Array.from(text.matchAll(codeBlockRegex))

		for (const codeBlock of codeBlocks) {
			// If a language is specified, this increases likelihood it's a code block for a file
			// const language = codeBlock[1]?.trim();
			const header = codeBlock[2]?.trim() || ""

			// Skip blocks that are obviously not file content
			const skipKeywords = ["output", "result", "example", "log", "console", "terminal", "stdout"]
			if (skipKeywords.some((keyword) => header.toLowerCase().includes(keyword))) {
				continue
			}

			// Extract possible file path, handling various formats
			let filePath = header

			// Remove quotes and formatting that might surround the path
			filePath = filePath.replace(/^["'`]|["'`]$/g, "")

			// Remove comment markers that might be in the header
			filePath = filePath.replace(/^(?:\/\/|#|\*|File:|Path:)\s*/, "")

			// If it looks like a path with a valid extension
			if (filePath && /\.\w+$/.test(filePath)) {
				const absolutePath = this.resolveAbsolutePath(filePath)

				// Add to modifications if not already present
				if (!existingModifications.has(absolutePath)) {
					existingModifications.set(absolutePath, filePath)
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
