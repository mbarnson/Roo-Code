import * as vscode from 'vscode';
import { VsCodeIntegratedClaudeCode, DiffViewProvider } from '../';
import { StatusReporter } from '../status-reporter';
import { CompletionResponse, PromptOptions } from '@roo/shared/api';

// Mock dependencies
jest.mock('vscode', () => ({
  window: {
    createStatusBarItem: jest.fn().mockReturnValue({
      text: '',
      show: jest.fn(),
      dispose: jest.fn()
    }),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn().mockResolvedValue('Apply Changes'),
    showWarningMessage: jest.fn().mockResolvedValue('Delete'),
    showTextDocument: jest.fn(),
    withProgress: jest.fn().mockImplementation((_, callback) => callback({
      report: jest.fn()
    }, { onCancellationRequested: jest.fn() }))
  },
  workspace: {
    fs: {
      readFile: jest.fn().mockResolvedValue(Buffer.from('original content')),
      writeFile: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      rename: jest.fn().mockResolvedValue(undefined),
      createDirectory: jest.fn().mockResolvedValue(undefined),
      stat: jest.fn().mockResolvedValue({ type: 1 })
    },
    openTextDocument: jest.fn().mockResolvedValue({}),
  },
  StatusBarAlignment: {
    Left: 1
  },
  ProgressLocation: {
    Notification: 1
  },
  Uri: {
    file: jest.fn(path => ({ path }))
  },
  commands: {
    executeCommand: jest.fn()
  }
}));

// Mock the ClaudeCodeHandler parent class
jest.mock('../claude-code', () => ({
  ClaudeCodeHandler: class {
    constructor() {}
    completePrompt = jest.fn().mockResolvedValue({
      content: 'Response with file operations\n\nwriting to file /test/file.js:\n```\nconst x = 1;\n```\n\nMore text.'
    })
  }
}));

// Mock DiffViewProvider
const mockDiffViewProvider: DiffViewProvider = {
  showDiff: jest.fn().mockResolvedValue(true)
};

// Mock StatusReporter
const mockStatusReporter: StatusReporter = {
  updateStatus: jest.fn(),
  showError: jest.fn(),
  showInfo: jest.fn(),
  showWarning: jest.fn(),
  showSuccess: jest.fn(),
  getMessages: jest.fn(),
  getCurrentStatus: jest.fn(),
  clearMessages: jest.fn(),
  dispose: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  emit: jest.fn(),
  listenerCount: jest.fn(),
  rawListeners: jest.fn(),
  listeners: jest.fn(),
  prependListener: jest.fn(),
  prependOnceListener: jest.fn(),
  eventNames: jest.fn(),
  addListener: jest.fn(),
  off: jest.fn()
};

describe('VsCodeIntegratedClaudeCode', () => {
  let claudeCode: VsCodeIntegratedClaudeCode;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    claudeCode = new VsCodeIntegratedClaudeCode({
      diffViewProvider: mockDiffViewProvider,
      statusReporter: mockStatusReporter
    });
  });
  
  describe('completePrompt', () => {
    it('should intercept file operations in the response', async () => {
      const options: PromptOptions = {
        prompt: 'Test prompt',
        modelId: 'claude-3'
      };
      
      const result = await claudeCode.completePrompt(options);
      
      // Verify status reporting
      expect(mockStatusReporter.updateStatus).toHaveBeenCalledWith(expect.stringContaining('Working'));
      expect(mockStatusReporter.updateStatus).toHaveBeenCalledWith(expect.stringContaining('Idle'));
      
      // Verify file operations were intercepted
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      expect(mockStatusReporter.showInfo).toHaveBeenCalled();
      
      // Verify response was modified
      expect(result.content).toContain('File /test/file.js has been updated in VS Code');
      expect(result.content).not.toContain('writing to file /test/file.js');
    });
    
    it('should handle errors during file operations', async () => {
      // Mock an error when writing file
      (vscode.workspace.fs.writeFile as jest.Mock).mockRejectedValueOnce(new Error('Write error'));
      
      const options: PromptOptions = {
        prompt: 'Test prompt',
        modelId: 'claude-3'
      };
      
      const result = await claudeCode.completePrompt(options);
      
      // Verify error handling
      expect(mockStatusReporter.showError).toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).toHaveBeenCalled();
      
      // Verify response still contains the content
      expect(result.content).toContain('File /test/file.js has been updated in VS Code');
    });
  });
  
  describe('parseFileOperationsFromResponse', () => {
    it('should detect file creations and updates', () => {
      const response = `Here's the implementation:
      
writing to file /test/create.js:
\`\`\`
const y = 2;
\`\`\`

I've also updated the existing file:

writing to file /test/update.js:
\`\`\`
const z = 3;
\`\`\`
`;
      
      // Use any to access private method
      const operations = (claudeCode as any).parseFileOperationsFromResponse(response);
      
      expect(operations).toHaveLength(2);
      expect(operations[0].type).toBe('update'); // Mocked to always exist
      expect(operations[0].path).toBe('/test/create.js');
      expect(operations[0].content).toBe('const y = 2;');
      expect(operations[1].type).toBe('update');
      expect(operations[1].path).toBe('/test/update.js');
      expect(operations[1].content).toBe('const z = 3;');
    });
    
    it('should detect file deletions', () => {
      const response = `I'll remove the old file:
      
deleting file /test/old.js

And then we can continue.`;
      
      const operations = (claudeCode as any).parseFileOperationsFromResponse(response);
      
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe('delete');
      expect(operations[0].path).toBe('/test/old.js');
    });
    
    it('should detect file renames', () => {
      const response = `Let's rename the file to a better name:
      
renaming file /test/old-name.js to /test/new-name.js

Now it has a more descriptive name.`;
      
      const operations = (claudeCode as any).parseFileOperationsFromResponse(response);
      
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe('rename');
      expect(operations[0].path).toBe('/test/new-name.js');
      expect(operations[0].oldPath).toBe('/test/old-name.js');
    });
  });
  
  describe('file operations', () => {
    it('should create a file and open it in a tab', async () => {
      await (claudeCode as any).createFile('/test/new-file.js', 'const a = 1;');
      
      expect(vscode.workspace.fs.createDirectory).toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
      expect(mockStatusReporter.showInfo).toHaveBeenCalledWith(expect.stringContaining('Created file'));
    });
    
    it('should update a file with diff view', async () => {
      await (claudeCode as any).updateFile('/test/existing-file.js', 'const b = 2;');
      
      expect(vscode.workspace.fs.readFile).toHaveBeenCalled();
      expect(mockDiffViewProvider.showDiff).toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      expect(mockStatusReporter.showInfo).toHaveBeenCalledWith(expect.stringContaining('Updated file'));
    });
    
    it('should delete a file with confirmation', async () => {
      await (claudeCode as any).deleteFile('/test/delete-file.js');
      
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
      expect(vscode.workspace.fs.delete).toHaveBeenCalled();
      expect(mockStatusReporter.showInfo).toHaveBeenCalledWith(expect.stringContaining('Deleted file'));
    });
    
    it('should rename a file', async () => {
      await (claudeCode as any).renameFile('/test/old-name.js', '/test/new-name.js');
      
      expect(vscode.workspace.fs.createDirectory).toHaveBeenCalled();
      expect(vscode.workspace.fs.rename).toHaveBeenCalled();
      expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
      expect(mockStatusReporter.showInfo).toHaveBeenCalledWith(expect.stringContaining('Renamed file'));
    });
  });
});