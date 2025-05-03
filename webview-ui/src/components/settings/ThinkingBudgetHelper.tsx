import React from "react";
import { ModelInfo, ApiConfiguration } from "@roo/shared/api";
import { ThinkingBudget } from "./ThinkingBudget";

interface ThinkingBudgetHelperProps {
  provider: string;
  modelId: string;
  modelInfo?: ModelInfo;
  apiConfiguration: ApiConfiguration;
  setApiConfigurationField: <K extends keyof ApiConfiguration>(field: K, value: ApiConfiguration[K]) => void;
}

/**
 * Helper component that determines when to show the thinking budget control
 * based on the provider and model.
 */
export const ThinkingBudgetHelper: React.FC<ThinkingBudgetHelperProps> = ({
  provider,
  modelId,
  modelInfo,
  apiConfiguration,
  setApiConfigurationField
}) => {
  const shouldShowThinkingBudget = () => {
    if (provider === "claude-code" && (modelId || "").includes("3-7")) {
      return true;
    }
    return modelInfo?.thinking === true;
  };

  if (!shouldShowThinkingBudget()) {
    return null;
  }

  return (
    <ThinkingBudget
      key={`${provider}-${modelId}`}
      apiConfiguration={apiConfiguration}
      setApiConfigurationField={setApiConfigurationField}
      modelInfo={modelInfo}
    />
  );
};