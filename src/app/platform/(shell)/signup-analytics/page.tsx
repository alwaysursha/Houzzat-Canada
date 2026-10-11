import { SignupAnalyticsDashboard } from "@/components/platform/SignupAnalyticsDashboard";
import {
  getPlatformFunnelAnalytics,
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
  let funnelReport = null;
  let funnelErrorMessage: string | null = null;

  const [signupResult, funnelResult] = await Promise.allSettled([
    getPlatformSignupAnalytics(filters),
    getPlatformFunnelAnalytics(filters),
  ]);

  if (signupResult.status === "fulfilled") {
    report = signupResult.value;
  } else {
    const error = signupResult.reason;
    errorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load signup analytics.";
  }

  if (funnelResult.status === "fulfilled") {
    funnelReport = funnelResult.value;
  } else {
    const error = funnelResult.reason;
    funnelErrorMessage =
      error instanceof PlatformApiClientError
        ? error.message
        : "Unable to load conversion funnel.";
  }

  return (
    <SignupAnalyticsDashboard
      report={report}
      errorMessage={errorMessage}
      filters={filters}
      funnelReport={funnelReport}
      funnelErrorMessage={funnelErrorMessage}
    />
  );
}
