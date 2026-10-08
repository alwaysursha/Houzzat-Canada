import type { PrimarySaveOutcome } from "@/lib/listings/save-primary-search";

export type SavedSearchApplyUiPlan = {
  openConfirm: boolean;
  closeFilters: boolean;
  toastSuccess: boolean;
  /** Second savePrimarySearch(confirmReplace: true) only after user confirms. */
  awaitsUserConfirm: boolean;
};

/**
 * UI plan after Filters/desktop Apply calls savePrimarySearch.
 * Confirmation must open only after Filters closes (no stacked overlays).
 */
export function planSavedSearchApplyUi(
  status: PrimarySaveOutcome["status"],
): SavedSearchApplyUiPlan {
  switch (status) {
    case "needs_confirm":
      return {
        openConfirm: true,
        closeFilters: true,
        toastSuccess: false,
        awaitsUserConfirm: true,
      };
    case "saved":
      return {
        openConfirm: false,
        closeFilters: true,
        toastSuccess: true,
        awaitsUserConfirm: false,
      };
    case "auth":
    case "error":
      return {
        openConfirm: false,
        closeFilters: false,
        toastSuccess: false,
        awaitsUserConfirm: false,
      };
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}
