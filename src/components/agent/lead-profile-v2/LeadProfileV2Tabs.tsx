import { cn } from "@/lib/utils";

export const LEAD_PROFILE_V2_TABS = [
  { id: "activity", label: "Activity" },
  { id: "info", label: "Info" },
  { id: "reminders", label: "Task & Reminders" },
  { id: "appointments", label: "Appointments" },
  { id: "conversations", label: "Conversations" },
  { id: "engagement", label: "Engagement" },
] as const;

export type LeadProfileV2TabId = (typeof LEAD_PROFILE_V2_TABS)[number]["id"];

export function LeadProfileV2Tabs({
  tab,
  onChange,
}: {
  tab: LeadProfileV2TabId;
  onChange: (id: LeadProfileV2TabId) => void;
}) {
  return (
    <div className="shrink-0 border-b border-[#e8edf2] bg-white">
      <div className="flex gap-0.5 overflow-x-auto overscroll-x-contain px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {LEAD_PROFILE_V2_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "relative shrink-0 px-3 py-2.5 text-[12px] font-semibold transition sm:px-3.5",
              tab === item.id
                ? "text-[#2b6cb0]"
                : "text-[#64748b] hover:text-[#1e2a38]",
            )}
          >
            {item.label}
            {tab === item.id ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#2b6cb0]" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
