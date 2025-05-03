/**
 * Function to safely process XML matcher chunks
 *
 * This helper ensures proper type checking when processing XML matcher outputs
 */
export function processXmlChunk(chunk: unknown): { type: "reasoning" | "text"; text: string } {
	// Type guard to ensure chunk has the expected properties
	if (
		chunk &&
		typeof chunk === "object" &&
		"matched" in chunk &&
		"data" in chunk &&
		typeof chunk.matched === "boolean" &&
		typeof chunk.data === "string"
	) {
		return {
			type: chunk.matched ? "reasoning" : "text",
			text: chunk.data,
		}
	}

	// Fallback for unexpected chunk format
	return {
		type: "text",
		text: typeof chunk === "string" ? chunk : "",
	}
}
