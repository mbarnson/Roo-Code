import React from "react";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";

export interface AuthenticationBlockProps {
  title: string;
  instructions: string;
  steps: Array<{
    content: React.ReactNode;
  }>;
  note?: string;
}

/**
 * Reusable authentication block component for provider authentication UI
 */
export const AuthenticationBlock: React.FC<AuthenticationBlockProps> = ({
  title,
  instructions,
  steps,
  note,
}) => (
  <div 
    className="my-2 p-3 text-sm rounded"
    style={{
      backgroundColor: "var(--vscode-inputValidation-infoBackground)",
      color: "var(--vscode-inputValidation-infoForeground)",
      border: "1px solid var(--vscode-inputValidation-infoBorder)",
    }}>
    <div className="font-semibold mb-1">{title}</div>
    <p className="mb-2">{instructions}</p>
    <ol className="list-decimal ml-5 mb-2">
      {steps.map((step, index) => (
        <li key={index} className="mb-1">{step.content}</li>
      ))}
    </ol>
    {note && <p className="text-xs">{note}</p>}
  </div>
);