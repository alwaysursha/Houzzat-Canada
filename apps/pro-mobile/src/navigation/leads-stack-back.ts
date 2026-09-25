import { StackActions } from "@react-navigation/routers";

/**
 * Pop only when the Leads stack itself has a screen above its root.
 * Does not consult parent navigators (unlike navigation.canGoBack()).
 */
export function leadsStackBackAction(state: { key: string; index: number } | null | undefined) {
  if (!state || !(state.index > 0)) return null;
  return {
    ...StackActions.pop(1),
    target: state.key,
  };
}
