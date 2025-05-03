# VS Code Integration for Claude Code Provider

This document outlines how to make the Claude Code provider more consistent with how other providers integrate with VS Code.

## Current Limitations

The Claude Code CLI operates differently from typical VS Code extensions:

1. **Direct File Manipulation**: Claude Code CLI modifies files directly rather than through VS Code's editor APIs.
2. **Limited Visibility**: There's no clear status display in the VS Code UI showing what operations are in progress.
3. **No Tab Integration**: It doesn't use VS Code tabs for file editing and navigation.
4. **Limited Context Tracking**: It doesn't track which files are open or being edited through VS Code.

## Integration Goals

To make the Claude Code provider more consistent with established Roo Code patterns:

1. **Use VS Code Editor APIs**: Edit files through VS Code primitives rather than direct file system operations.
2. **Visible Status Display**: Show operations in the Roo Code panel with proper progress indicators.
3. **Tab Management**: Open files in VS Code tabs when they're being worked with.
4. **Context Tracking**: Track open files and maintain context for the AI model.

## Implementation Approach

### 1. File Editing Integration

Replace direct file manipulation with VS Code editor APIs:

```typescript
// CURRENT APPROACH (Direct file manipulation)
// Claude Code CLI modifies files directly through its own mechanisms

// NEW APPROACH (VS Code integration)
// When Claude Code wants to edit a file, intercept and use VS Code APIs instead
const applyEdit = async (filePath: string, newContent: string) => {
  // Open the document in VS Code
  const document = await vscode.workspace.openTextDocument(filePath);
  
  // Show the document in an editor tab
  const editor = await vscode.window.showTextDocument(document);
  
  // Create a workspace edit
  const edit = new vscode.WorkspaceEdit();
  
  // Replace the entire content
  const entireRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
  
  edit.replace(document.uri, entireRange, newContent);
  
  // Apply the edit through VS Code
  await vscode.workspace.applyEdit(edit);
}
```

### 2. Status Display

Integrate with Roo Code's status display components:

```typescript
// Use existing components like CommandExecution and ProgressIndicator
// When Claude Code operations start/complete:

// For commands
showCommandExecution({
  command: "claude-code chat",
  status: "running", // or "completed", "failed"
  output: outputStream,
  exitCode: exitCode
});

// For general progress
updateProgress({
  value: progressValue,
  status: "Generating response...",
  tokens: {
    used: tokensUsed,
    total: tokenLimit
  }
});
```

### 3. Integration with FileContextTracker

Ensure the Claude Code provider updates the context tracker:

```typescript
// When Claude Code accesses a file
fileContextTracker.trackFileAccess(filePath, {
  operation: "read", // or "write"
  timestamp: Date.now()
});

// When Claude Code is about to modify a file
const isStale = await fileContextTracker.checkFileStale(filePath);
if (isStale) {
  // Re-read the file or take appropriate action
}
```

### 4. Tab Management

Implement proper tab management:

```typescript
// When Claude Code wants to work with a file
const openFileInTab = async (filePath: string) => {
  const document = await vscode.workspace.openTextDocument(filePath);
  
  // Show in active editor group
  const editor = await vscode.window.showTextDocument(document, {
    preview: false, // Don't use preview (keeps tab open)
    viewColumn: vscode.ViewColumn.Active 
  });
  
  return editor;
};
```

## Architecture Changes

### 1. Wrapper for Claude Code CLI

Create a wrapper layer that intercepts Claude Code CLI operations:

```typescript
class VsCodeIntegratedClaudeCode {
  private cliHandler: ClaudeCodeHandler;
  
  constructor(options: ClaudeCodeOptions) {
    this.cliHandler = new ClaudeCodeHandler(options);
  }
  
  async *createMessage(systemPrompt: string, messages: MessageParam[]): ApiStream {
    // Start progress indicator in VS Code UI
    showProgress("Generating response...");
    
    try {
      // Use the underlying CLI handler but with status reporting
      for await (const chunk of this.cliHandler.createMessage(systemPrompt, messages)) {
        // Update UI status
        updateStatus(chunk);
        
        // If chunk references a file, ensure that file is opened in a tab
        if (filePathMentioned(chunk.text)) {
          await openFileInTab(extractFilePath(chunk.text));
        }
        
        yield chunk;
      }
    } finally {
      // Clean up UI indicators
      hideProgress();
    }
  }
}
```

### 2. File Operation Interception

Create utilities to intercept file operations:

```typescript
// When Claude Code wants to modify a file
const interceptFileModification = async (filePath: string, newContent: string) => {
  // Instead of direct file writing
  // 1. Show diff view with VS Code editor
  const diffProvider = new DiffViewProvider();
  
  // 2. Create diff and request approval
  const approved = await diffProvider.showDiff(filePath, newContent);
  
  if (approved) {
    // 3. If approved, apply through VS Code editor
    await applyEdit(filePath, newContent);
  }
  
  return approved;
};
```

### 3. Terminal Command Visibility

Enhance terminal command visibility:

```typescript
// When Claude Code executes a command
const executeWithVisibility = async (command: string) => {
  const commandView = new CommandExecutionView();
  
  // Show the command in UI with "running" status
  commandView.show(command);
  
  try {
    // Execute the command
    const result = await executeCommand(command);
    
    // Update UI with result
    commandView.complete(result.exitCode, result.output);
    
    return result;
  } catch (error) {
    // Show error in UI
    commandView.fail(error.message);
    throw error;
  }
};
```

## Implementation Steps

1. **Create VS Code Integration Layer**:
   - Develop a wrapper for ClaudeCodeHandler that integrates with VS Code APIs
   - Implement file operation interception 
   - Add status reporting

2. **User Interface Integration**:
   - Connect Claude Code operations to existing Roo UI components
   - Add progress indicators for CLI operations
   - Implement file tab management

3. **Context Tracking Integration**:
   - Ensure Claude Code operations update the FileContextTracker
   - Track file dependencies and mentions
   - Maintain consistency with workspace state

4. **Command Execution Visibility**:
   - Show Claude Code CLI commands in the UI similar to other commands
   - Provide real-time feedback on command progress

## Benefits

By implementing these changes, the Claude Code provider will:

1. **Provide Better Visibility**: Users can see what operations are happening
2. **Follow VS Code Patterns**: Use native VS Code tabs and editing
3. **Maintain Context**: Keep track of files and edits properly
4. **Improve User Experience**: Make interaction more consistent with other providers

## Challenges and Considerations

1. **Performance**: Introducing a wrapper layer may add some overhead
2. **Error Handling**: Need to carefully translate Claude Code errors to VS Code UI
3. **Authentication Flow**: Must integrate the authentication process with VS Code UI
4. **File Path Resolution**: Handle relative vs absolute paths consistently
5. **Process Management**: Ensure proper process lifecycle for long-running operations

## Next Steps

1. Prototype the VS Code integration wrapper
2. Test with simple file operations
3. Enhance the implementation with full UI integration
4. Add context tracking and tab management
5. Implement comprehensive error handling