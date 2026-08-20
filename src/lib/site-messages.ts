/** Shared copy for site alert / confirm / toast templates. */

export const SITE_MESSAGES = {
  watchAdded: {
    title: "Added to your watchlist",
    message:
      "We'll notify you about price changes, status updates, and when the home sells — including the sold price when it's available. This watch is saved in your dashboard under Watchlist, where you can manage or turn off alerts anytime.",
    confirmLabel: "Got it",
  },
  watchRemovedToast: "Removed from watchlist. You won’t get alerts for this home.",
  saveRequiresEmailVerificationToast:
    "Verify your email to save listings.",
  watchRequiresEmailVerificationToast:
    "Verify your email to watch listings and areas.",
  saveAddedToast: "Added to Saved Listings",
  saveRemovedToast: "Removed from Saved Listings",
  routePlannerRemovedToast: "Removed from Route Planner",
  areaWatchedToast: "Area added to your watchlist.",
  areaRemovedToast: "Area removed from your watchlist.",
  genericErrorToast: "Something went wrong. Please try again.",
  deleteSavedSearch: {
    title: "Delete this saved search?",
    message: "This can’t be undone. You can create a new search anytime.",
    confirmLabel: "Delete search",
    cancelLabel: "Keep it",
  },
  stopWatchingHome: {
    title: "Stop watching this home?",
    message: "You’ll stop receiving price and status alerts for this listing.",
    confirmLabel: "Stop watching",
    cancelLabel: "Keep watching",
  },
  removeAreaWatch: {
    title: "Remove this area watch?",
    message: "You’ll stop receiving new and sold alerts for this area.",
    confirmLabel: "Remove",
    cancelLabel: "Keep watching",
  },
  clearHomepageSearch: {
    title: "Clear custom search?",
    message:
      "Your homepage will stop filtering to this saved search and show all listings again. The search itself stays in your account.",
    confirmLabel: "Clear custom search",
    cancelLabel: "Keep personalized",
  },
  removeHomepageSearch: {
    title: "Remove from homepage?",
    message:
      "This saved search will no longer personalize your homepage. It will remain in Saved searches.",
    confirmLabel: "Remove",
    cancelLabel: "Keep on homepage",
  },
  signOut: {
    title: "Sign out?",
    message: "You’ll need to sign in again to use your saved homes and watchlist.",
    confirmLabel: "Sign out",
    cancelLabel: "Stay signed in",
  },
} as const;
