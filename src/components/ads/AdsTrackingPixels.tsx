"use client";

/**
 * Lightweight pixel / tag hooks. Set NEXT_PUBLIC_META_PIXEL_ID and
 * NEXT_PUBLIC_GOOGLE_ADS_ID when ready — no-ops otherwise.
 */
export function AdsTrackingPixels() {
  const metaId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const googleId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

  if (!metaId && !googleId) return null;

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
      {googleId ? (
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${googleId}`}
        />
      ) : null}
      {googleId ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${googleId}');
            `,
          }}
        />
      ) : null}
    </>
  );
}
