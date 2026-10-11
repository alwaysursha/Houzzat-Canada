import { SignupAnalyticsDashboard } from "@/components/platform/SignupAnalyticsDashboard";
import {
  getPlatformSignupAnalytics,
  PlatformApiClientError,
} from "@/lib/platform/ui/api-client";

type PageProps = {
  searchParams: Promise<{
    workspaceId?: string;
    preset?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function PlatformSignupAnalyticsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const filters = {
    workspaceId: params.workspaceId?.trim() || undefined,
    preset: params.preset?.trim() || undefined,
    from: params.from?.trim() || undefined,
    to: params.to?.trim() || undefined,
  };

  let report = null;
  let errorMessage: string | null = null;

  try {
    report = await getPlatformSignupAnalytics(filters);
  } catch (error) {
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load signup analytics.";
  }

  return (
    <SignupAnalyticsDashboard
      report={report}
      errorMessage={errorMessage}
      filters={filters}
    />
  );
}
