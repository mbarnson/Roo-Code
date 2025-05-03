import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DiffViewProvider } from '../diff-view-provider';

jest.mock('vscode', () => ({
  Uri: {
    file: jest.fn(file => ({ fsPath: file }))
  },
  commands: {
    executeCommand: jest.fn().mockResolvedValue(undefined)
  },
  window: {
    showInformationMessage: jest.fn().mockResolvedValue('Apply Changes')
  },
  ViewColumn: {
    Active: 1
  }
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn()
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  basename: jest.fn(path => path.split('/').pop())
}));

jest.mock('os', () => ({
  tmpdir: jest.fn().mockReturnValue('/tmp')
}));

describe('DiffViewProvider', () => {
  let provider: DiffViewProvider;
  
  beforeEach(() => {
    jest.clearAllMocks();
    provider = DiffViewProvider.create();
  });
  
  describe('showDiff', () => {
    it('should create temporary files and show a diff', async () => {
      const result = await provider.showDiff(
        '/test/file.js',
        'original content',
        'modified content'
      );
      
      // Verify temporary directory and files are created
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).not.toHaveBeenCalled(); // Mock returns that dir exists
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(path.join).toHaveBeenCalledWith('/tmp', 'claude-code-diff');
      
      // Verify the diff command is executed
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        expect.anything(),
        expect.anything(),
        expect.stringContaining('Changes proposed by Claude Code'),
        expect.anything()
      );
      
      // Verify confirmation dialog is shown
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Do you want to apply these changes'),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
      
      // Verify temporary files are cleaned up
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      
      // Verify the result based on mock configuration
      expect(result).toBe(true);
    });
    
    it('should handle errors gracefully', async () => {
      // Mock an error when executing command
      (vscode.commands.executeCommand as jest.Mock).mockRejectedValueOnce(new Error('Command error'));
      
      const result = await provider.showDiff(
        '/test/file.js',
        'original content',
        'modified content'
      );
      
      // Verify error handling
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
      
      // Should still attempt to clean up temp files
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      
      // Should return false on error
      expect(result).toBe(false);
    });
    
    it('should create the temp directory if it does not exist', async () => {
      // Mock directory not existing
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
      
      await provider.showDiff(
        '/test/file.js',
        'original content',
        'modified content'
      );
      
      // Verify directory creation
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('claude-code-diff'),
        expect.objectContaining({ recursive: true })
      );
    });
    
    it('should return false if the user rejects the changes', async () => {
      // Mock user rejecting the changes
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Reject');
      
      const result = await provider.showDiff(
        '/test/file.js',
        'original content',
        'modified content'
      );
      
      // Verify the result
      expect(result).toBe(false);
      
      // Should still clean up temp files
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });
    
    it('should handle cleanup errors gracefully', async () => {
      // Mock an error during cleanup
      (fs.unlinkSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Cleanup error');
      });
      
      // Should not throw even with cleanup error
      const result = await provider.showDiff(
        '/test/file.js',
        'original content',
        'modified content'
      );
      
      expect(result).toBe(true); // Should still return based on user choice
    });
  });
  
  describe('create', () => {
    it('should create a new instance of DiffViewProvider', () => {
      const provider = DiffViewProvider.create();
      expect(provider).toBeInstanceOf(DiffViewProvider);
    });
  });
});