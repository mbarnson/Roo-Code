import * as vscode from 'vscode';
import { ClaudeCodeHandler } from './claude-code';
import type { DiffViewProvider } from './diff-view-provider';
import { t } from '../../i18n';
import type { CompletionResponse, PromptOptions, ProviderOptions } from './common-types';

// Wrapper for t function to handle record type
function tFormat(key: string, defaultValue?: string, params?: Record<string, any>): string {
  if (params) {
    // Convert to any to work around the type mismatch issue
    return t(key, defaultValue as any, params);
  }
  return t(key, defaultValue as any);
}

/**
 * Interface for file context tracking
 */
export interface FileContextTracker {
  trackFile(filePath: string): void;
  markFileAsEditedByRoo(filePath: string): void;
  trackFileContext(filePath: string, reason: string): Promise<void>;
}

/**
 * Interface for file operations
 */
export interface FileOperation {
  type: 'create' | 'update' | 'delete' | 'rename';
  path: string;
  content?: string;
  oldPath?: string; // For rename operations
}

/**
 * Interface for status reporting
 */
export interface StatusReporter {
  updateStatus(status: string): void;
  showError(error: Error): void;
  showInfo(message: string): void;
}

/**
 * Options for the VS Code integrated Claude Code Handler
 */
export interface VsCodeIntegratedClaudeCodeOptions extends ProviderOptions {
  fileContextTracker?: FileContextTracker;
  diffViewProvider?: DiffViewProvider;
  statusReporter?: StatusReporter;
}

/**
 * A wrapper around ClaudeCodeHandler that integrates with VS Code
 * to intercept file operations and route them through VS Code APIs.
 */
export class VsCodeIntegratedClaudeCode extends ClaudeCodeHandler {
  private statusBarItem: vscode.StatusBarItem;
  private fileContextTracker?: FileContextTracker;
  private diffViewProvider?: DiffViewProvider;
  private statusReporter?: StatusReporter;
  private openedTabs = new Set<string>();

  constructor(options: VsCodeIntegratedClaudeCodeOptions) {
    super(options);
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    this.statusBarItem.text = 'Claude Code: Idle';
    this.statusBarItem.show();
    
    this.fileContextTracker = options.fileContextTracker;
    this.diffViewProvider = options.diffViewProvider;
    this.statusReporter = options.statusReporter;
  }

  /**
   * Override to intercept file operations and route them through VS Code
   */
  async completePrompt(options: PromptOptions): Promise<CompletionResponse> {
    this.updateStatus(t("common:status.claude_code.working"));
    
    try {
      // Get the original response from Claude Code
      const result = await super.completePrompt(options);
      
      // Process the response to intercept file operations
      if (result.content) {
        await this.processResponse(result);
      }
      
      this.updateStatus(tFormat("common:status.claude_code.idle", "Idle"));
      return result;
    } catch (error) {
      this.updateStatus(tFormat("common:status.claude_code.error", "Error"));
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Process the response to intercept file operations
   */
  private async processResponse(response: CompletionResponse): Promise<void> {
    // Extract file operations from the response
    const fileOperations = this.parseFileOperationsFromResponse(response.content);
    
    if (fileOperations.length === 0) {
      return;
    }
    
    // Apply file operations through VS Code APIs
    await this.applyFileOperationsViaVSCode(fileOperations);
    
    // Update the response to remove file operations if needed
    response.content = this.removeFileOperationsFromResponse(response.content);
  }

  /**
   * Parse file operations from the response
   */
  private parseFileOperationsFromResponse(response: string): FileOperation[] {
    const operations: FileOperation[] = [];
    
    // Use regex patterns to detect file operations
    // This is a simplified implementation and would need to be more robust
    
    // Detect file creations and updates
    const fileWriteRegex = /writing to file\s+([^\s]+)\s*:\s*```([\s\S]*?)```/gi;
    let match;
    
    while ((match = fileWriteRegex.exec(response)) !== null) {
      const path = match[1];
      const content = match[2];
      
      // Check if the file exists to determine if this is an update or create
      const fileExists = this.fileExists(path);
      
      operations.push({
        type: fileExists ? 'update' : 'create',
        path,
        content
      });
    }
    
    // Detect file deletions
    const fileDeleteRegex = /deleting file\s+([^\s]+)/gi;
    
    while ((match = fileDeleteRegex.exec(response)) !== null) {
      const path = match[1];
      
      operations.push({
        type: 'delete',
        path
      });
    }
    
    // Detect file renames
    const fileRenameRegex = /renaming file\s+([^\s]+)\s+to\s+([^\s]+)/gi;
    
    while ((match = fileRenameRegex.exec(response)) !== null) {
      const oldPath = match[1];
      const newPath = match[2];
      
      operations.push({
        type: 'rename',
        path: newPath,
        oldPath
      });
    }
    
    return operations;
  }

  /**
   * Check if a file exists
   */
  private fileExists(path: string): boolean {
    try {
      const stat = vscode.workspace.fs.stat(vscode.Uri.file(path));
      return !!stat;
    } catch (error) {
      return false;
    }
  }

  /**
   * Remove file operations from the response
   */
  private removeFileOperationsFromResponse(response: string): string {
    // Replace file operation sections with a more VS Code appropriate message
    let modifiedResponse = response;
    
    modifiedResponse = modifiedResponse.replace(
      /writing to file\s+([^\s]+)\s*:\s*```([\s\S]*?)```/gi,
      'File $1 has been updated in VS Code'
    );
    
    modifiedResponse = modifiedResponse.replace(
      /deleting file\s+([^\s]+)/gi,
      'File $1 has been deleted in VS Code'
    );
    
    modifiedResponse = modifiedResponse.replace(
      /renaming file\s+([^\s]+)\s+to\s+([^\s]+)/gi,
      'File $1 has been renamed to $2 in VS Code'
    );
    
    return modifiedResponse;
  }

  /**
   * Apply file operations via VS Code APIs
   */
  private async applyFileOperationsViaVSCode(operations: FileOperation[]): Promise<void> {
    // Group operations by type for better user experience
    const creates = operations.filter(op => op.type === 'create');
    const updates = operations.filter(op => op.type === 'update');
    const deletes = operations.filter(op => op.type === 'delete');
    const renames = operations.filter(op => op.type === 'rename');
    
    // Show progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: tFormat("common:progress.claude_code.applyingChanges", "Applying Claude Code changes"),
        cancellable: true
      },
      async (progress, token) => {
        token.onCancellationRequested(() => {
          throw new Error(tFormat("common:errors.claude_code.cancelled", "File operations cancelled"));
        });
        
        // Process creates
        if (creates.length > 0) {
          progress.report({
            message: tFormat("common:progress.claude_code.creatingFiles", "Creating files..."),
            increment: 25
          });
          
          for (const op of creates) {
            await this.createFile(op.path, op.content || '');
          }
        }
        
        // Process updates
        if (updates.length > 0) {
          progress.report({
            message: t('claudeCode.progress.updatingFiles', 'Updating files...'),
            increment: 25
          });
          
          for (const op of updates) {
            await this.updateFile(op.path, op.content || '');
          }
        }
        
        // Process deletes
        if (deletes.length > 0) {
          progress.report({
            message: t('claudeCode.progress.deletingFiles', 'Deleting files...'),
            increment: 25
          });
          
          for (const op of deletes) {
            await this.deleteFile(op.path);
          }
        }
        
        // Process renames
        if (renames.length > 0) {
          progress.report({
            message: t('claudeCode.progress.renamingFiles', 'Renaming files...'),
            increment: 25
          });
          
          for (const op of renames) {
            if (op.oldPath) {
              await this.renameFile(op.oldPath, op.path);
            }
          }
        }
      }
    );
  }

  /**
   * Create a file and open it in a tab
   */
  private async createFile(path: string, content: string): Promise<void> {
    try {
      // Ensure the directory exists
      const dirUri = vscode.Uri.file(path.substring(0, path.lastIndexOf('/')));
      await vscode.workspace.fs.createDirectory(dirUri);
      
      // Create the file
      const fileUri = vscode.Uri.file(path);
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content));
      
      // Open the file in a tab
      await this.openFileInTab(path);
      
      // Update context tracking
      this.updateFileContext(path);
      
      // Log creation
      this.showInfo(t('claudeCode.info.fileCreated', 'Created file: {path}', { path }));
    } catch (error) {
      this.handleError(new Error(t('claudeCode.error.createFailed', 'Failed to create file {path}', { path })));
    }
  }

  /**
   * Update a file with diff view if available
   */
  private async updateFile(path: string, content: string): Promise<void> {
    try {
      // Get the current file content
      const fileUri = vscode.Uri.file(path);
      let currentContent = '';
      
      try {
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        currentContent = Buffer.from(fileData).toString('utf8');
      } catch (error) {
        // File doesn't exist, treat as create
        return this.createFile(path, content);
      }
      
      // If the content is the same, no need to update
      if (currentContent === content) {
        return;
      }
      
      // Use diff view if available
      if (this.diffViewProvider) {
        const approved = await this.diffViewProvider.showDiff(path, currentContent, content);
        
        if (!approved) {
          this.showInfo(t('claudeCode.info.updateRejected', 'Update to {path} was rejected', { path }));
          return;
        }
      }
      
      // Update the file
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content));
      
      // Open the file in a tab
      await this.openFileInTab(path);
      
      // Update context tracking
      this.updateFileContext(path);
      
      // Log update
      this.showInfo(t('claudeCode.info.fileUpdated', 'Updated file: {path}', { path }));
    } catch (error) {
      this.handleError(new Error(t('claudeCode.error.updateFailed', 'Failed to update file {path}', { path })));
    }
  }

  /**
   * Delete a file with confirmation
   */
  private async deleteFile(path: string): Promise<void> {
    try {
      // Confirm deletion
      const confirmed = await vscode.window.showWarningMessage(
        t('claudeCode.warning.confirmDelete', 'Are you sure you want to delete {path}?', { path }),
        { modal: true },
        t('claudeCode.button.delete', 'Delete')
      );
      
      if (confirmed !== t('claudeCode.button.delete', 'Delete')) {
        return;
      }
      
      // Delete the file
      const fileUri = vscode.Uri.file(path);
      await vscode.workspace.fs.delete(fileUri);
      
      // Remove from opened tabs
      this.openedTabs.delete(path);
      
      // Log deletion
      this.showInfo(t('claudeCode.info.fileDeleted', 'Deleted file: {path}', { path }));
    } catch (error) {
      this.handleError(new Error(t('claudeCode.error.deleteFailed', 'Failed to delete file {path}', { path })));
    }
  }

  /**
   * Rename a file
   */
  private async renameFile(oldPath: string, newPath: string): Promise<void> {
    try {
      // Get the current file content
      const oldUri = vscode.Uri.file(oldPath);
      const newUri = vscode.Uri.file(newPath);
      
      // Ensure the directory exists
      const dirUri = vscode.Uri.file(newPath.substring(0, newPath.lastIndexOf('/')));
      await vscode.workspace.fs.createDirectory(dirUri);
      
      // Rename the file
      await vscode.workspace.fs.rename(oldUri, newUri);
      
      // Open the new file in a tab
      await this.openFileInTab(newPath);
      
      // Update context tracking
      this.updateFileContext(newPath);
      
      // Remove old file from tracking
      this.openedTabs.delete(oldPath);
      
      // Log rename
      this.showInfo(t('claudeCode.info.fileRenamed', 'Renamed file: {oldPath} to {newPath}', { oldPath, newPath }));
    } catch (error) {
      this.handleError(new Error(t('claudeCode.error.renameFailed', 'Failed to rename file {oldPath} to {newPath}', { oldPath, newPath })));
    }
  }

  /**
   * Open a file in a tab
   */
  private async openFileInTab(path: string): Promise<vscode.TextEditor | undefined> {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
      const editor = await vscode.window.showTextDocument(document, { preview: false });
      this.openedTabs.add(path);
      return editor;
    } catch (error) {
      this.handleError(new Error(t('claudeCode.error.openFailed', 'Failed to open file {path}', { path })));
      return undefined;
    }
  }

  /**
   * Update file context
   */
  private updateFileContext(path: string): void {
    if (this.fileContextTracker) {
      this.fileContextTracker.trackFile(path);
    }
  }

  /**
   * Update status
   */
  private updateStatus(status: string): void {
    this.statusBarItem.text = `Claude Code: ${status}`;
    
    if (this.statusReporter) {
      this.statusReporter.updateStatus(status);
    }
  }

  /**
   * Show info message
   */
  private showInfo(message: string): void {
    if (this.statusReporter) {
      this.statusReporter.showInfo(message);
    }
  }

  /**
   * Handle error
   */
  private handleError(error: Error): void {
    vscode.window.showErrorMessage(error.message);
    
    if (this.statusReporter) {
      this.statusReporter.showError(error);
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}

/**
 * Interface for diff view provider
 */
export interface DiffViewProvider {
  showDiff(path: string, oldContent: string, newContent: string): Promise<boolean>;
}

/**
 * Create a VS Code integrated Claude Code handler
 */
export function createVsCodeIntegratedClaudeCode(
  options: VsCodeIntegratedClaudeCodeOptions
): VsCodeIntegratedClaudeCode {
  return new VsCodeIntegratedClaudeCode(options);
}