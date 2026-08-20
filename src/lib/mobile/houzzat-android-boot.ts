export const HOUZZAT_ANDROID_BOOT_KEY = "houzzat:android-boot-cover";
export const HOUZZAT_ANDROID_BOOT_BG = "#0A2F24";
export const HOUZZAT_ANDROID_BOOT_MIN_MS = 520;
export const HOUZZAT_ANDROID_BOOT_FADE_MS = 340;
export const HOUZZAT_ANDROID_BOOT_MAX_MS = 12000;

/**
 * Must stay pixel-identical to
 * `android/app/src/main/res/drawable/splash_house.png`
 * (Android 12 `windowSplashScreenAnimatedIcon`).
 */
export const HOUZZAT_ANDROID_SPLASH_ICON =
  "/images/houzzat-android-splash-icon.png";

/**
 * Android 12 places the splash animated icon in a 240dp box, centered on
 * `windowSplashScreenBackground`. Web cover mirrors that exactly — one
 * baked lockup image, no separate CSS wordmark/gap.
 */
export const HOUZZAT_ANDROID_SPLASH_ICON_DP = 240;

export const HOUZZAT_ANDROID_BOOT_CSS = [
  "html.hz-android-booting,html.hz-android-booting body{background:#0A2F24!important}",
  // Flat solid only — must match Android 12 windowSplashScreenBackground.
  "#hz-android-boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;background:#0A2F24;-webkit-user-select:none;user-select:none}",
  "#hz-android-boot .stage{position:relative;z-index:1;display:grid;place-items:center;will-change:opacity}",
  // 240 CSS px ≈ 240dp in the Android WebView viewport.
  `#hz-android-boot .mark{display:block;width:${HOUZZAT_ANDROID_SPLASH_ICON_DP}px;height:${HOUZZAT_ANDROID_SPLASH_ICON_DP}px;object-fit:contain}`,
  `#hz-android-boot.hz-boot--out .stage{opacity:0;transition:opacity ${HOUZZAT_ANDROID_BOOT_FADE_MS}ms cubic-bezier(.22,1,.36,1)}`,
  `#hz-android-boot.hz-boot--out{opacity:0;pointer-events:none;transition:opacity ${HOUZZAT_ANDROID_BOOT_FADE_MS}ms cubic-bezier(.22,1,.36,1)}`,
].join("");

export const HOUZZAT_ANDROID_BOOT_MARKUP = `<div class="stage"><img class="mark" src="${HOUZZAT_ANDROID_SPLASH_ICON}" alt="" width="${HOUZZAT_ANDROID_SPLASH_ICON_DP}" height="${HOUZZAT_ANDROID_SPLASH_ICON_DP}"/></div>`;

export function isHouzzatAndroidConsumer(userAgent = ""): boolean {
  return (
    /Android/i.test(userAgent) &&
    /HouzzatNative\/\d+\s*\(com\.houzzat\.app\)/.test(userAgent)
  );
}

export function shouldSkipHouzzatAndroidBoot(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/agent") ||
    pathname.startsWith("/pro")
  );
}

/**
 * First-paint boot cover for the Houzzat Android consumer WebView.
 * Paints before React so Capacitor can hide the native splash onto a
 * matching branded frame instead of the plain WebView color.
 */
export function getHouzzatAndroidBootScript(): string {
  return `(function(){try{var ua=navigator.userAgent||"";if(!/Android/i.test(ua)||!/HouzzatNative\\/\\d+\\s*\\(com\\.houzzat\\.app\\)/.test(ua))return;try{if(window.self!==window.top)return}catch(e){return}var p=location.pathname||"";if(p.indexOf("/admin")===0||p.indexOf("/agent")===0||p.indexOf("/pro")===0)return;var K=${JSON.stringify(HOUZZAT_ANDROID_BOOT_KEY)};function hideNative(){try{var C=window.Capacitor,P=C&&C.Plugins&&C.Plugins.SplashScreen;if(P&&P.hide)P.hide({fadeOutDuration:0})}catch(e){}}function pollHide(){var n=0,t=setInterval(function(){hideNative();n++;if(n>80)clearInterval(t)},50)}try{if(sessionStorage.getItem(K)==="1"){pollHide();return}}catch(e){}if(document.getElementById("hz-android-boot"))return;document.documentElement.classList.add("hz-android-booting");if(!document.getElementById("hz-android-boot-css")){var css=document.createElement("style");css.id="hz-android-boot-css";css.textContent=${JSON.stringify(HOUZZAT_ANDROID_BOOT_CSS)};document.documentElement.appendChild(css)}var d=document.createElement("div");d.id="hz-android-boot";d.setAttribute("aria-hidden","true");d.setAttribute("data-started",String(Date.now()));d.innerHTML=${JSON.stringify(HOUZZAT_ANDROID_BOOT_MARKUP)};(document.body||document.documentElement).appendChild(d);try{sessionStorage.setItem(K,"1")}catch(e){}var handed=false;function handoff(){if(handed)return;handed=true;pollHide()}var img=d.querySelector("img.mark");if(img&&img.complete)handoff();else if(img){img.addEventListener("load",handoff);img.addEventListener("error",handoff)}setTimeout(handoff,400)}catch(e){}})();`;
}
