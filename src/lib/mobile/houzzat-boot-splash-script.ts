export const HOUZZAT_BOOT_SESSION_KEY = "houzzat:cinematic-boot";

/** Shared with the first-paint script so the fallback overlay matches. */
export const HOUZZAT_BOOT_SPLASH_CSS = [
  "#hz-boot-pre{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;background:#0a2f24;color:#fff;font-family:ui-sans-serif,system-ui,sans-serif}",
  "#hz-boot-pre .bg{position:absolute;inset:-18%;background:radial-gradient(ellipse 70% 55% at 50% 38%,#1a7b59 0%,#0f4c3a 42%,#07251c 100%);transform:scale(1.04)}",
  "#hz-boot-pre .wash{position:absolute;inset:0;background:linear-gradient(165deg,rgba(232,197,71,.16),transparent 42%,rgba(7,37,28,.35));opacity:.85}",
  "#hz-boot-pre .stage{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:18px}",
  "#hz-boot-pre .mark{width:min(38vw,168px);height:auto;filter:drop-shadow(0 18px 40px rgba(0,0,0,.38))}",
  "#hz-boot-pre .word{opacity:0;transform:translateY(10px);letter-spacing:.42em;font-size:11px;font-weight:800;text-transform:uppercase;color:rgba(255,255,255,.88)}",
  "#hz-boot-pre.hz-boot--run .bg{animation:hzWash 1.1s ease both}",
  "#hz-boot-pre.hz-boot--run .mark{animation:hzBloom 1.05s cubic-bezier(.22,1,.36,1) both}",
  "#hz-boot-pre.hz-boot--run .word{animation:hzWord .55s ease .2s both}",
  "#hz-boot-pre.hz-boot--out{opacity:0;pointer-events:none;transition:opacity .38s ease}",
  "@keyframes hzWash{from{transform:scale(1.04)}to{transform:scale(1)}}",
  "@keyframes hzBloom{0%{transform:scale(1)}55%{transform:scale(1.06)}100%{transform:scale(1)}}",
  "@keyframes hzWord{to{opacity:1;transform:none}}",
].join("");

/**
 * First-paint overlay for the consumer Android/iOS app.
 * Runs as the first body script so the WebView never sits on a plain green
 * Capacitor splash while React boots.
 */
export function getHouzzatBootSplashScript(): string {
  return `(function(){try{if(!/HouzzatNative\\/\\d+\\s*\\(com\\.houzzat\\.app\\)/.test(navigator.userAgent))return;var p=location.pathname||"";if(p.indexOf("/admin")===0||p.indexOf("/agent")===0||p.indexOf("/pro")===0)return;try{if(sessionStorage.getItem(${JSON.stringify(HOUZZAT_BOOT_SESSION_KEY)})==="1")return}catch(e){}if(document.getElementById("hz-boot-pre"))return;var css=document.createElement("style");css.id="hz-boot-pre-css";css.textContent=${JSON.stringify(HOUZZAT_BOOT_SPLASH_CSS)};document.documentElement.appendChild(css);var d=document.createElement("div");d.id="hz-boot-pre";d.setAttribute("aria-hidden","true");d.innerHTML='<div class="bg"></div><div class="wash"></div><div class="stage"><img class="mark" src="/images/houzzat-house-mark.png" alt="" width="168" height="168"/><div class="word">Houzzat</div></div>';(document.body||document.documentElement).appendChild(d);var n=0,t=setInterval(function(){try{var C=window.Capacitor,P=C&&C.Plugins&&C.Plugins.SplashScreen;if(P&&P.hide){P.hide();clearInterval(t)}}catch(e){}n++;if(n>40)clearInterval(t)},50)}catch(e){}})();`;
}
