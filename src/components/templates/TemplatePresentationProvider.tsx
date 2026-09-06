/**
 * Stage 6.11B — Template presentation context for shared rails/cards.
 */
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ImplementedTemplateId } from "@/lib/tenancy/templates";
import { DEFAULT_TEMPLATE_ID } from "@/lib/tenancy/templates";

export type TemplatePresentationValue = {
  templateId: ImplementedTemplateId;
};

const TemplatePresentationContext = createContext<TemplatePresentationValue>({
  templateId: DEFAULT_TEMPLATE_ID,
});

export function TemplatePresentationProvider({
  templateId,
  children,
}: {
  templateId: ImplementedTemplateId;
  children: ReactNode;
}) {
  return (
    <TemplatePresentationContext.Provider value={{ templateId }}>
      {children}
    </TemplatePresentationContext.Provider>
  );
}

export function useTemplatePresentation(): TemplatePresentationValue {
  return useContext(TemplatePresentationContext);
}
