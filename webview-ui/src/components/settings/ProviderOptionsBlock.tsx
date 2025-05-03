import React from "react";

interface ProviderOptionsBlockProps {
  children: React.ReactNode;
  title?: string;
}

/**
 * Container component for provider-specific options
 */
export const ProviderOptionsBlock: React.FC<ProviderOptionsBlockProps> = ({ 
  children, 
  title 
}) => (
  <div className="flex flex-col gap-3 provider-options-block">
    {title && <h3 className="text-lg font-medium">{title}</h3>}
    {children}
  </div>
);