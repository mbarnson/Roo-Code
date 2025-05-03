import * as vscode from 'vscode';
import { StatusReporter, StatusLevel, StatusReporterEvent } from '../status-reporter';

jest.mock('vscode', () => ({
  window: {
    createStatusBarItem: jest.fn().mockReturnValue({
      text: '',
      show: jest.fn(),
      dispose: jest.fn()
    }),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn()
  },
  StatusBarAlignment: {
    Left: 1
  }
}));

describe('StatusReporter', () => {
  let reporter: StatusReporter;
  
  beforeEach(() => {
    jest.clearAllMocks();
    reporter = StatusReporter.create();
  });
  
  describe('updateStatus', () => {
    it('should update the status and emit event', () => {
      const emitSpy = jest.spyOn(reporter, 'emit');
      
      reporter.updateStatus('Working');
      
      expect(emitSpy).toHaveBeenCalledWith(StatusReporterEvent.StatusChanged, 'Working');
      expect(reporter.getCurrentStatus()).toBe('Working');
    });
  });
  
  describe('showError', () => {
    it('should show error and add message', () => {
      const emitSpy = jest.spyOn(reporter, 'emit');
      const error = new Error('Test error');
      
      reporter.showError(error);
      
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Test error'));
      expect(emitSpy).toHaveBeenCalledWith(StatusReporterEvent.MessageAdded, expect.objectContaining({
        text: 'Test error',
        level: StatusLevel.Error
      }));
      
      const messages = reporter.getMessages();
      expect(messages[0].text).toBe('Test error');
      expect(messages[0].level).toBe(StatusLevel.Error);
    });
  });
  
  describe('showInfo', () => {
    it('should add info message', () => {
      const emitSpy = jest.spyOn(reporter, 'emit');
      
      reporter.showInfo('Info message');
      
      expect(emitSpy).toHaveBeenCalledWith(StatusReporterEvent.MessageAdded, expect.objectContaining({
        text: 'Info message',
        level: StatusLevel.Info
      }));
      
      const messages = reporter.getMessages();
      expect(messages[0].text).toBe('Info message');
      expect(messages[0].level).toBe(StatusLevel.Info);
    });
  });
  
  describe('showWarning', () => {
    it('should show warning and add message', () => {
      const emitSpy = jest.spyOn(reporter, 'emit');
      
      reporter.showWarning('Warning message');
      
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Warning message'));
      expect(emitSpy).toHaveBeenCalledWith(StatusReporterEvent.MessageAdded, expect.objectContaining({
        text: 'Warning message',
        level: StatusLevel.Warning
      }));
      
      const messages = reporter.getMessages();
      expect(messages[0].text).toBe('Warning message');
      expect(messages[0].level).toBe(StatusLevel.Warning);
    });
  });
  
  describe('showSuccess', () => {
    it('should show success message and add message', () => {
      const emitSpy = jest.spyOn(reporter, 'emit');
      
      reporter.showSuccess('Success message');
      
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('Success message'));
      expect(emitSpy).toHaveBeenCalledWith(StatusReporterEvent.MessageAdded, expect.objectContaining({
        text: 'Success message',
        level: StatusLevel.Success
      }));
      
      const messages = reporter.getMessages();
      expect(messages[0].text).toBe('Success message');
      expect(messages[0].level).toBe(StatusLevel.Success);
    });
  });
  
  describe('message management', () => {
    it('should limit the number of messages', () => {
      // Add more messages than the limit (set to 100 in the implementation)
      for (let i = 0; i < 110; i++) {
        reporter.showInfo(`Message ${i}`);
      }
      
      const messages = reporter.getMessages();
      expect(messages.length).toBeLessThanOrEqual(100);
      expect(messages[0].text).toBe('Message 109'); // Most recent should be first
    });
    
    it('should clear messages', () => {
      reporter.showInfo('Test message');
      expect(reporter.getMessages().length).toBe(1);
      
      const emitSpy = jest.spyOn(reporter, 'emit');
      reporter.clearMessages();
      
      expect(reporter.getMessages().length).toBe(0);
      expect(emitSpy).toHaveBeenCalledWith(StatusReporterEvent.MessageAdded, null);
    });
  });
  
  describe('dispose', () => {
    it('should dispose resources and remove listeners', () => {
      const removeAllListenersSpy = jest.spyOn(reporter, 'removeAllListeners');
      
      reporter.dispose();
      
      expect(removeAllListenersSpy).toHaveBeenCalled();
    });
  });
  
  describe('create', () => {
    it('should create a new instance of StatusReporter', () => {
      const reporter = StatusReporter.create();
      expect(reporter).toBeInstanceOf(StatusReporter);
    });
  });
});