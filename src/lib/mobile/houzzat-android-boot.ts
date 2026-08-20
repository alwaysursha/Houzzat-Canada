export const HOUZZAT_ANDROID_BOOT_KEY = "houzzat:android-boot-cover";
export const HOUZZAT_ANDROID_BOOT_BG = "#0A2F24";
export const HOUZZAT_ANDROID_BOOT_MIN_MS = 520;
export const HOUZZAT_ANDROID_BOOT_FADE_MS = 340;
export const HOUZZAT_ANDROID_BOOT_SLOW_MS = 2800;
export const HOUZZAT_ANDROID_BOOT_MAX_MS = 12000;

export const HOUZZAT_ANDROID_BOOT_CSS = [
  "html.hz-android-booting,html.hz-android-booting body{background:#0A2F24!important}",
  "#hz-android-boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;background:#0A2F24;color:#fff;-webkit-user-select:none;user-select:none}",
  "#hz-android-boot .bg{position:absolute;inset:-14%;background:radial-gradient(ellipse 70% 55% at 50% 42%,#1A7B59 0%,#0F4C3A 42%,#0A2F24 74%,#07251C 100%)}",
  "#hz-android-boot .stage{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:18px;will-change:opacity,transform}",
  "#hz-android-boot .mark{width:min(38vw,168px);height:auto}",
  "#hz-android-boot .word{margin:0;font-family:var(--font-fraunces),Georgia,serif;font-size:clamp(26px,7.2vw,34px);font-weight:600;letter-spacing:-0.025em;line-height:1;color:#fff}",
  "#hz-android-boot .hint{position:absolute;bottom:12%;left:50%;width:36px;height:2px;border-radius:1px;background:rgba(255,255,255,.35);opacity:0;transform:translateX(-50%);transition:opacity .4s ease}",
  "#hz-android-boot.hz-boot--slow .hint{opacity:1}",
  "#hz-android-boot.hz-boot--out .stage{opacity:0;transform:scale(1.02);transition:opacity 340ms cubic-bezier(.22,1,.36,1),transform 340ms cubic-bezier(.22,1,.36,1)}",
  "#hz-android-boot.hz-boot--out{opacity:0;pointer-events:none;transition:opacity 340ms cubic-bezier(.22,1,.36,1)}",
].join("");

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
  return `(function(){try{var ua=navigator.userAgent||"";if(!/Android/i.test(ua)||!/HouzzatNative\\/\\d+\\s*\\(com\\.houzzat\\.app\\)/.test(ua))return;try{if(window.self!==window.top)return}catch(e){return}var p=location.pathname||"";if(p.indexOf("/admin")===0||p.indexOf("/agent")===0||p.indexOf("/pro")===0)return;var K=${JSON.stringify(HOUZZAT_ANDROID_BOOT_KEY)};function hideNative(){try{var C=window.Capacitor,P=C&&C.Plugins&&C.Plugins.SplashScreen;if(P&&P.hide)P.hide({fadeOutDuration:0})}catch(e){}}function pollHide(){var n=0,t=setInterval(function(){hideNative();n++;if(n>80)clearInterval(t)},50)}try{if(sessionStorage.getItem(K)==="1"){pollHide();return}}catch(e){}if(document.getElementById("hz-android-boot"))return;document.documentElement.classList.add("hz-android-booting");if(!document.getElementById("hz-android-boot-css")){var css=document.createElement("style");css.id="hz-android-boot-css";css.textContent=${JSON.stringify(HOUZZAT_ANDROID_BOOT_CSS)};document.documentElement.appendChild(css)}var d=document.createElement("div");d.id="hz-android-boot";d.setAttribute("aria-hidden","true");d.setAttribute("data-started",String(Date.now()));d.innerHTML='<div class="bg"></div><div class="stage"><img class="mark" src="/images/houzzat-house-mark.png" alt="" width="168" height="168"/><p class="word">Houzzat</p></div><div class="hint"></div>';(document.body||document.documentElement).appendChild(d);try{sessionStorage.setItem(K,"1")}catch(e){}var handed=false;function handoff(){if(handed)return;handed=true;pollHide()}var img=d.querySelector("img.mark");if(img&&img.complete)handoff();else if(img){img.addEventListener("load",handoff);img.addEventListener("error",handoff)}setTimeout(handoff,400)}catch(e){}})();`;
}
