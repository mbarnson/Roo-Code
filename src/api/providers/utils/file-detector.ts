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
        if (!text) return [];
        
        // Regex for detecting file paths
        const filePathRegex = /(?:^|\s)([./\\]?[\w-]+(?:[./\\][\w-]+)+\.\w+)/g
        const matches = Array.from(text.matchAll(filePathRegex))
        
        // Map matched paths to absolute paths
        return matches
            .map(match => match[1])
            .filter(Boolean)
            .map(filePath => this.resolveAbsolutePath(filePath));
    }

    /**
     * Detect file modifications in text using heuristic patterns
     * 
     * @param text Text to scan for file modifications
     * @param existingModifications Optional map to accumulate results
     * @returns Map of file paths to original paths
     */
    detectFileModifications(text: string, existingModifications: Map<string, string> = new Map()): Map<string, string> {
        if (!text) return existingModifications;
        
        // Common patterns indicating file modifications
        const fileModificationPatterns = [
            /I've (updated|created|modified|written) (?:the file|file) (?:at |)(?:'|")?([\w/\\.-]+)(?:'|")?/i,
            /I've applied the changes to (?:'|")?([\w/\\.-]+)(?:'|")?/i,
            /I've created a new file (?:at |)(?:'|")?([\w/\\.-]+)(?:'|")?/i,
            /File (?:created|updated|modified): (?:'|")?([\w/\\.-]+)(?:'|")?/i,
            /Created (?:a |)new file (?:at |in |)(?:'|")?([\w/\\.-]+)(?:'|")?/i,
            /Modified (?:file |)(?:'|")?([\w/\\.-]+)(?:'|")?/i
        ]
        
        // Process each pattern
        for (const pattern of fileModificationPatterns) {
            const matches = text.matchAll(pattern)
            for (const match of matches) {
                const filePath = match[1]
                if (filePath) {
                    const absolutePath = this.resolveAbsolutePath(filePath)
                    if (!existingModifications.has(absolutePath)) {
                        existingModifications.set(absolutePath, filePath)
                    }
                }
            }
        }
        
        return existingModifications;
    }
    
    /**
     * Resolves a path to an absolute path
     * 
     * @param filePath Path to resolve
     * @returns Absolute path
     */
    private resolveAbsolutePath(filePath: string): string {
        return path.isAbsolute(filePath) 
            ? filePath 
            : path.resolve(this.cwd, filePath);
    }
}