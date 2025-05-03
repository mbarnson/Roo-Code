import { Anthropic } from "@anthropic-ai/sdk"
import { spawn } from "child_process"

import { ModelInfo } from "../../shared/api"
import { ApiHandler, SingleCompletionHandler } from "../../api/index"
import { ApiStream } from "../../api/transform/stream"
import { BaseProvider } from "../../api/providers/base-provider"
import { XmlMatcher } from "../../utils/xml-matcher"
import {
  ClaudeCodeAuthStatus,
  ClaudeCodeCommandOptions,
  ClaudeCodeModelInfo,
  ClaudeCodeModelsMap,
  ClaudeCodeChatInput,
} from "./claude-code-models"

// Re-export the ClaudeCodeHandler from the API directory
export { ClaudeCodeHandler } from "../../api/providers/claude-code"
export { getClaudeCodeModels } from "../../api/providers/claude-code"