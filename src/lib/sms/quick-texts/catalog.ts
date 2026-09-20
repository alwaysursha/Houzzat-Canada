import {
  SMS_QUICK_TEXT_VARIABLES,
  type SmsQuickTextVariable,
} from "./constants";

export type SmsQuickTextCatalogSpec = {
  key: string;
  name: string;
  category: string;
  sortOrder: number;
  allowedVariables: SmsQuickTextVariable[];
  body: string;
};

const INTRO: SmsQuickTextVariable[] = [
  "firstName",
  "agentName",
  "workspaceName",
];
const WITH_PROPERTY: SmsQuickTextVariable[] = [
  "firstName",
  "agentName",
  "workspaceName",
  "propertyAddress",
];

export const SMS_QUICK_TEXT_CATALOG: readonly SmsQuickTextCatalogSpec[] = [
  {
    key: "new_lead_introduction",
    name: "New Lead Introduction",
    category: "New Lead Introduction",
    sortOrder: 10,
    allowedVariables: INTRO,
    body: "Hi {{firstName}}, it's {{agentName}} at {{workspaceName}}. Thanks for reaching out — I'm here if you'd like help looking at homes. Reply anytime.",
  },
  {
    key: "still_looking",
    name: "Still Looking?",
    category: "Still Looking?",
    sortOrder: 20,
    allowedVariables: INTRO,
    body: "Hi {{firstName}}, it's {{agentName}} at {{workspaceName}}. Are you still looking? Happy to send a few options that fit.",
  },
  {
    key: "viewing_help",
    name: "Viewing Help",
    category: "Viewing Help",
    sortOrder: 30,
    allowedVariables: WITH_PROPERTY,
    body: "Hi {{firstName}}, it's {{agentName}} at {{workspaceName}}. I can help arrange a viewing at {{propertyAddress}}. What day and time work best?",
  },
  {
    key: "need_more_options",
    name: "Need More Options?",
    category: "Need More Options?",
    sortOrder: 40,
    allowedVariables: INTRO,
    body: "Hi {{firstName}}, it's {{agentName}} at {{workspaceName}}. Want me to send a few more homes based on what you've been looking at?",
  },
  {
    key: "quick_follow_up",
    name: "Quick Follow-Up",
    category: "Quick Follow-Up",
    sortOrder: 50,
    allowedVariables: INTRO,
    body: "Hi {{firstName}}, just checking in — {{agentName}} at {{workspaceName}}. Any questions I can help with?",
  },
];

export function smsQuickTextCatalogByKey(
  key: string,
): SmsQuickTextCatalogSpec | null {
  return SMS_QUICK_TEXT_CATALOG.find((row) => row.key === key) ?? null;
}

export { SMS_QUICK_TEXT_VARIABLES };
