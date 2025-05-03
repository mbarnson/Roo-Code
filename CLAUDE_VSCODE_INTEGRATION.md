# VS Code Integration for Claude Code Provider

## Overview

The Claude Code CLI directly modifies files rather than using VS Code's editor APIs. This can lead to several issues:

1. **File Synchronization**: VS Code may not detect changes made by Claude Code
2. **Tab Management**: Files aren't automatically opened in VS Code tabs
3. **Context Tracking**: VS Code's file context tracking system isn't utilized
4. **Error Feedback**: Errors in file operations aren't displayed in VS Code UI

## Implementation Plan

### Phase 1: File Operation Interception

Create a wrapper layer that intercepts file operations and routes them through VS Code APIs.

```typescript
class VsCodeIntegratedClaudeCode extends ClaudeCodeHandler {
  // Intercept file operations
  async interceptFileOperations(message: string, response: string): Promise<string> {
    // Parse file operations from response
    const fileOperations = this.parseFileOperationsFromResponse(response);
    
    // Apply operations through VS Code APIs
    await this.applyFileOperationsViaVSCode(fileOperations);
    
    // Return modified response without file operations
    return this.removeFileOperationsFromResponse(response);
  }
  
  // Apply file operations via VS Code APIs
  private async applyFileOperationsViaVSCode(operations: FileOperation[]): Promise<void> {
    for (const op of operations) {
      switch (op.type) {
        case "create":
          await vscode.window.showTextDocument(vscode.Uri.file(op.path), { preview: false });
          await vscode.workspace.fs.writeFile(vscode.Uri.file(op.path), Buffer.from(op.content));
          break;
        case "update":
          const document = await vscode.workspace.openTextDocument(op.path);
          const editor = await vscode.window.showTextDocument(document, { preview: false });
          await editor.edit(editBuilder => {
            // Apply edits
          });
          break;
        case "delete":
          await vscode.workspace.fs.delete(vscode.Uri.file(op.path));
          break;
      }
    }
  }
}
```

### Phase 2: Status Display

Implement status reporting in the VS Code UI.

```typescript
class VsCodeIntegratedClaudeCode extends ClaudeCodeHandler {
  // Status reporting
  private statusBarItem: vscode.StatusBarItem;
  
  constructor() {
    super();
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    this.statusBarItem.show();
  }
  
  updateStatus(status: string): void {
    this.statusBarItem.text = `Claude Code: ${status}`;
  }
  
  async completePrompt(options: PromptOptions): Promise<CompletionResponse> {
    this.updateStatus("Working...");
    try {
      const result = await super.completePrompt(options);
      this.updateStatus("Idle");
      return result;
    } catch (error) {
      this.updateStatus("Error");
      throw error;
    }
  }
}
```

### Phase 3: Tab Management

Implement tab management to ensure files are opened in VS Code tabs.

```typescript
class VsCodeIntegratedClaudeCode extends ClaudeCodeHandler {
  // Track opened tabs
  private openedTabs = new Set<string>();
  
  // Open file in tab
  private async openFileInTab(path: string): Promise<vscode.TextEditor> {
    const document = await vscode.workspace.openTextDocument(path);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    this.openedTabs.add(path);
    return editor;
  }
  
  // Apply file operations with tab management
  private async applyFileOperationsViaVSCode(operations: FileOperation[]): Promise<void> {
    for (const op of operations) {
      if (op.type === "create" || op.type === "update") {
        await this.openFileInTab(op.path);
      }
    }
  }
}
```

### Phase 4: Context Tracking

Implement context tracking to ensure VS Code's file context system is updated.

```typescript
class VsCodeIntegratedClaudeCode extends ClaudeCodeHandler {
  // Track file context
  private fileContextTracker?: FileContextTracker;
  
  constructor(options: ClaudeCodeOptions) {
    super(options);
    this.fileContextTracker = createFileContextTracker(options.clineProvider);
  }
  
  // Update file context
  private updateFileContext(path: string): void {
    if (this.fileContextTracker) {
      this.fileContextTracker.trackFile(path);
    }
  }
  
  // Apply file operations with context tracking
  private async applyFileOperationsViaVSCode(operations: FileOperation[]): Promise<void> {
    for (const op of operations) {
      if (op.type === "create" || op.type === "update") {
        this.updateFileContext(op.path);
      }
    }
  }
}
```

## Implementation Details

### File Operation Detection

The key challenge is detecting file operations in Claude Code's responses. We'll use these approaches:

1. **Regex Patterns**: Look for specific patterns in the response that indicate file operations
2. **Response Structure**: Analyze the structure of Claude Code responses
3. **Claude Code CLI Modifications**: If possible, modify Claude Code CLI to report file operations

### File Operation Types

We'll handle these operation types:

1. **Create**: Create a new file
2. **Update**: Update an existing file
3. **Delete**: Delete a file
4. **Rename**: Rename a file

### Error Handling

Implement robust error handling with user feedback:

1. **Operation Validation**: Validate file operations before applying them
2. **Error Propagation**: Propagate errors through VS Code notification system
3. **Recovery**: Implement recovery strategies for failed operations

## Testing Strategy

1. **Unit Tests**: Test individual components of the VS Code integration
2. **Integration Tests**: Test the integration with VS Code APIs
3. **End-to-End Tests**: Test the full flow from prompt to file operations
4. **Error Handling Tests**: Test error scenarios and recovery

## Future Enhancements

1. **Differential Updates**: Implement differential updates for file operations
2. **Operation Batching**: Batch file operations for better performance
3. **Undo Support**: Implement undo support for Claude Code operations