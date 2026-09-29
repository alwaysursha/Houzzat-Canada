import {
  googleTagInstall,
  workspaceTrackingIds,
  type WorkspaceTrackingIds,
} from "@/lib/ads/workspace-tracking";

/**
 * Public tags for the resolved workspace. No workspace ID loads nothing.
 * Conversion events stay in the shared gtag helpers.
 */
export function AdsTrackingPixels(ids: Partial<WorkspaceTrackingIds>) {
  const tracking = workspaceTrackingIds(ids);
  const google = googleTagInstall(tracking);
  const metaId = tracking.metaPixelId;

  if (!google && !metaId) return null;

  return (
    <>
      {metaId ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${metaId}');fbq('track','PageView');
            `,
          }}
        />
      ) : null}
      {google ? (
        <script async src={google.src} />
      ) : null}
      {google ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());${google.config}
            `,
          }}
        />
      ) : null}
    </>
  );
}
