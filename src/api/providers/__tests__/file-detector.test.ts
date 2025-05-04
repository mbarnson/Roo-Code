import { FileDetector } from "../utils/file-detector"
import * as path from "path"

describe("FileDetector", () => {
	const testWorkspacePath = "/test/workspace"
	let detector: FileDetector

	beforeEach(() => {
		detector = new FileDetector(testWorkspacePath)
	})

	describe("detectFilePaths", () => {
		it("should detect absolute file paths in text", () => {
			const text = "Here is a file at /test/workspace/src/index.ts and another at /usr/local/bin/file.txt"
			const paths = detector.detectFilePaths(text)
			expect(paths).toContain("/test/workspace/src/index.ts")
			expect(paths).toContain("/usr/local/bin/file.txt")
		})

		it("should detect relative file paths and resolve them", () => {
			const text = "Check the file at src/utils.js"
			const paths = detector.detectFilePaths(text)
			expect(paths).toContain(path.resolve(testWorkspacePath, "src/utils.js"))
		})

		it("should handle file paths with extensions", () => {
			const text = "Files: main.js, styles.css, index.html, package.json"
			const paths = detector.detectFilePaths(text)
			expect(paths).toContain(path.resolve(testWorkspacePath, "main.js"))
			expect(paths).toContain(path.resolve(testWorkspacePath, "styles.css"))
			expect(paths).toContain(path.resolve(testWorkspacePath, "index.html"))
			expect(paths).toContain(path.resolve(testWorkspacePath, "package.json"))
		})

		it("should ignore non-file strings", () => {
			const text = "This is just text without file paths. Words like example or test aren't files."
			const paths = detector.detectFilePaths(text)
			expect(paths).toEqual([])
		})

		it("should handle empty input", () => {
			const paths = detector.detectFilePaths("")
			expect(paths).toEqual([])

			const nullPaths = detector.detectFilePaths(null as unknown as string)
			expect(nullPaths).toEqual([])
		})

		it("should handle file paths with directory structure", () => {
			const text = "Look at src/components/Button.tsx and src/utils/helpers/format.js"
			const paths = detector.detectFilePaths(text)
			expect(paths).toContain(path.resolve(testWorkspacePath, "src/components/Button.tsx"))
			expect(paths).toContain(path.resolve(testWorkspacePath, "src/utils/helpers/format.js"))
		})
	})

	describe("detectFileModifications", () => {
		it("should detect file creation patterns", () => {
			// More explicit creation pattern matching the code's implementation
			const text =
				"I've created a new file called `src/example.ts` with the following content:\n```typescript\nconst x = 1;\n```"
			const modifications = detector.detectFileModifications(text)

			expect(modifications.size).toBe(1)
			expect(modifications.has(path.resolve(testWorkspacePath, "src/example.ts"))).toBe(true)
		})

		it("should detect file update patterns", () => {
			// More explicit update pattern matching the code's implementation
			const text =
				"I've updated the file `src/app.js` with these changes:\n```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```"
			const modifications = detector.detectFileModifications(text)

			expect(modifications.size).toBe(1)
			expect(modifications.has(path.resolve(testWorkspacePath, "src/app.js"))).toBe(true)
		})

		it("should handle quoted file paths", () => {
			const text =
				"I've modified 'src/index.js' with this fix:\n```js\nconsole.log('Fixed');\n```\n\nAnd I created a new file at \"src/utils/helper.js\":\n```js\nfunction helper() { return true; }\n```"
			const modifications = detector.detectFileModifications(text)

			expect(modifications.size).toBe(2)
			expect(modifications.has(path.resolve(testWorkspacePath, "src/index.js"))).toBe(true)
			expect(modifications.has(path.resolve(testWorkspacePath, "src/utils/helper.js"))).toBe(true)
		})

		it("should detect multiple file modifications in the same text", () => {
			const text =
				"I've updated src/app.js:\n```js\nconsole.log('updated');\n```\n\nAnd I've also created a new file src/components/Button.tsx:\n```tsx\nexport const Button = () => <button>Click me</button>;\n```"
			const modifications = detector.detectFileModifications(text)

			expect(modifications.size).toBe(2)
			expect(modifications.has(path.resolve(testWorkspacePath, "src/app.js"))).toBe(true)
			expect(modifications.has(path.resolve(testWorkspacePath, "src/components/Button.tsx"))).toBe(true)
		})

		it("should handle abbreviated syntax like 'Modified file: ...'", () => {
			const text =
				"File: src/index.js\n```js\nconst a = 1;\n```\n\nFile: src/utils.js\n```js\nexport function utils() {}\n```"
			const modifications = detector.detectFileModifications(text)

			expect(modifications.size).toBe(2)
			expect(modifications.has(path.resolve(testWorkspacePath, "src/index.js"))).toBe(true)
			expect(modifications.has(path.resolve(testWorkspacePath, "src/utils.js"))).toBe(true)
		})

		it("should accumulate results when provided with existing modifications", () => {
			const existingModifications = new Map<string, string>()
			existingModifications.set(path.resolve(testWorkspacePath, "src/existing.js"), "src/existing.js")

			const text = "I've updated src/new.js:\n```js\nconsole.log('new');\n```"
			const modifications = detector.detectFileModifications(text, existingModifications)

			expect(modifications.size).toBe(2)
			expect(modifications.has(path.resolve(testWorkspacePath, "src/existing.js"))).toBe(true)
			expect(modifications.has(path.resolve(testWorkspacePath, "src/new.js"))).toBe(true)
		})

		it("should handle empty input", () => {
			const modifications = detector.detectFileModifications("")
			expect(modifications.size).toBe(0)

			const nullModifications = detector.detectFileModifications(null as unknown as string)
			expect(nullModifications.size).toBe(0)
		})
	})
})
