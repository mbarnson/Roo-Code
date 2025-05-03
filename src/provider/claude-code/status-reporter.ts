import * as vscode from 'vscode';
import { t } from 'i18next';
import { EventEmitter } from 'events';

/**
 * Status levels for Claude Code status reports
 */
export enum StatusLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Success = 'success'
}

/**
 * Interface for status message
 */
export interface StatusMessage {
  text: string;
  level: StatusLevel;
  timestamp: Date;
}

/**
 * Events emitted by StatusReporter
 */
export enum StatusReporterEvent {
  StatusChanged = 'statusChanged',
  MessageAdded = 'messageAdded'
}

/**
 * Status reporter for Claude Code provider
 * Reports status changes and messages to UI components
 */
export class StatusReporter extends EventEmitter {
  private statusBarItem: vscode.StatusBarItem;
  private currentStatus: string = t('claudeCode.status.idle', 'Idle');
  private messages: StatusMessage[] = [];
  private maxMessages: number = 100;

  constructor() {
    super();
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    this.statusBarItem.text = `Claude Code: ${this.currentStatus}`;
    this.statusBarItem.show();
  }

  /**
   * Update the current status
   */
  updateStatus(status: string): void {
    this.currentStatus = status;
    this.statusBarItem.text = `Claude Code: ${status}`;
    this.emit(StatusReporterEvent.StatusChanged, status);
  }

  /**
   * Show an error message
   */
  showError(error: Error): void {
    const message: StatusMessage = {
      text: error.message,
      level: StatusLevel.Error,
      timestamp: new Date()
    };

    this.addMessage(message);
    vscode.window.showErrorMessage(`Claude Code: ${error.message}`);
  }

  /**
   * Show an info message
   */
  showInfo(message: string): void {
    const statusMessage: StatusMessage = {
      text: message,
      level: StatusLevel.Info,
      timestamp: new Date()
    };

    this.addMessage(statusMessage);
  }

  /**
   * Show a warning message
   */
  showWarning(message: string): void {
    const statusMessage: StatusMessage = {
      text: message,
      level: StatusLevel.Warning,
      timestamp: new Date()
    };

    this.addMessage(statusMessage);
    vscode.window.showWarningMessage(`Claude Code: ${message}`);
  }

  /**
   * Show a success message
   */
  showSuccess(message: string): void {
    const statusMessage: StatusMessage = {
      text: message,
      level: StatusLevel.Success,
      timestamp: new Date()
    };

    this.addMessage(statusMessage);
    vscode.window.showInformationMessage(`Claude Code: ${message}`);
  }

  /**
   * Add a message to the message history
   */
  private addMessage(message: StatusMessage): void {
    this.messages.unshift(message);
    
    // Limit the number of messages
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(0, this.maxMessages);
    }
    
    this.emit(StatusReporterEvent.MessageAdded, message);
  }

  /**
   * Get all messages
   */
  getMessages(): StatusMessage[] {
    return [...this.messages];
  }

  /**
   * Get the current status
   */
  getCurrentStatus(): string {
    return this.currentStatus;
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
    this.emit(StatusReporterEvent.MessageAdded, null);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.statusBarItem.dispose();
    this.removeAllListeners();
  }

  /**
   * Create a new instance of StatusReporter
   */
  static create(): StatusReporter {
    return new StatusReporter();
  }
}