import React from "react";
import { ModelInfo } from "@roo/shared/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui";
import { useAppTranslation } from "@src/i18n/TranslationContext";
import { ModelInfoView } from "./ModelInfoView";

export interface ModelSelectionBlockProps {
  apiProvider: string;
  modelId: string;
  defaultModelId: string;
  models: Record<string, ModelInfo>;
  onModelChange: (value: string) => void;
  isDescriptionExpanded: boolean;
  setIsDescriptionExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Reusable model selection component with model info display
 */
export const ModelSelectionBlock: React.FC<ModelSelectionBlockProps> = ({
  apiProvider,
  modelId,
  defaultModelId,
  models,
  onModelChange,
  isDescriptionExpanded,
  setIsDescriptionExpanded,
}) => {
  const { t } = useAppTranslation();
  const effectiveModelId = modelId || defaultModelId;
  
  return (
    <>
      <div>
        <label className="block font-medium mb-1">{t("settings:providers.model")}</label>
        <Select 
          value={effectiveModelId}
          onValueChange={onModelChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("settings:common.select")} />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(models).map((id) => (
              <SelectItem key={id} value={id}>
                {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ModelInfoView
        apiProvider={apiProvider}
        selectedModelId={effectiveModelId}
        modelInfo={models[effectiveModelId]}
        isDescriptionExpanded={isDescriptionExpanded}
        setIsDescriptionExpanded={setIsDescriptionExpanded}
      />
    </>
  );
};