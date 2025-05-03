import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { t } from 'i18next';

/**
 * Provider for displaying file diffs and getting user approval
 */
export class DiffViewProvider {
  /**
   * Temporary file paths that need cleanup
   */
  private tempFilePaths: string[] = [];
  /**
   * Show a diff view between old and new content
   * @param filePath Path to the file being modified
   * @param oldContent Original content
   * @param newContent New content
   * @returns Promise resolving to true if user approves, false otherwise
   */
  async showDiff(filePath: string, oldContent: string, newContent: string): Promise<boolean> {
    // Create temporary files for the diff view
    const tmpDir = path.join(os.tmpdir(), 'claude-code-diff');
    
    try {
      // Create temp directory if it doesn't exist
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      
      const fileName = path.basename(filePath);
      const oldFilePath = path.join(tmpDir, `${fileName}.original`);
      const newFilePath = path.join(tmpDir, `${fileName}.modified`);
      
      // Write content to temp files
      fs.writeFileSync(oldFilePath, oldContent);
      fs.writeFileSync(newFilePath, newContent);
      
      // Create URIs for diff
      const oldUri = vscode.Uri.file(oldFilePath);
      const newUri = vscode.Uri.file(newFilePath);
      
      // Show diff document
      await vscode.commands.executeCommand(
        'vscode.diff',
        oldUri,
        newUri,
        `${fileName} (Changes proposed by Claude Code)`,
        { viewColumn: vscode.ViewColumn.Active }
      );
      
      // Ask user for approval
      const result = await vscode.window.showInformationMessage(
        t('claudeCode.diff.confirmChanges', 'Do you want to apply these changes to {fileName}?', { fileName }),
        { modal: true },
        t('claudeCode.diff.apply', 'Apply Changes'),
        t('claudeCode.diff.reject', 'Reject')
      );
      
      // Clean up temp files
      this.cleanupTempFiles(oldFilePath, newFilePath);
      
      return result === t('claudeCode.diff.apply', 'Apply Changes');
    } catch (error) {
      vscode.window.showErrorMessage(t('claudeCode.diff.error', 'Error showing diff view: {error}', { error: (error as Error).message }));
      return false;
    }
  }
  
  /**
   * Clean up temporary files
   */
  private cleanupTempFiles(...filePaths: string[]): void {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
  
  /**
   * Create a new instance of DiffViewProvider
   */
  static create(): DiffViewProvider {
    return new DiffViewProvider();
  }
}