"use client";

import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { useEffect, useState } from "react";
import { resolveAppShell } from "@/lib/mobile/app-shell";
import { SITE_NAME } from "@/lib/constants";

const SESSION_KEY = "houzzat:cinematic-boot";
const HOLD_MS = 2100;
const FADE_MS = 620;

function shouldSkipPath(pathname: string) {
  return (
    pathname.startsWith("/pro") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/agent")
  );
}

/**
 * Cinematic Houzzat cold-start overlay (native consumer app only).
 * Android 12’s system splash is a static icon — this is the motion after it.
 */
export function HouzzatBootSplash() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (shouldSkipPath(window.location.pathname)) return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      void SplashScreen.hide().catch(() => undefined);
      return;
    }

    let cancelled = false;
    let fadeTimer: number | undefined;
    let hideTimer: number | undefined;

    void (async () => {
      const shell = await resolveAppShell();
      if (cancelled) return;
      if (shell !== "houzzat") {
        void SplashScreen.hide().catch(() => undefined);
        return;
      }
      sessionStorage.setItem(SESSION_KEY, "1");
      setVisible(true);
      void SplashScreen.hide().catch(() => undefined);
      fadeTimer = window.setTimeout(() => {
        if (!cancelled) setExiting(true);
      }, HOLD_MS);
      hideTimer = window.setTimeout(() => {
        if (!cancelled) setVisible(false);
      }, HOLD_MS + FADE_MS);
    })();

    return () => {
      cancelled = true;
      if (fadeTimer) window.clearTimeout(fadeTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="hz-boot"
      data-exiting={exiting ? "1" : "0"}
      role="dialog"
      aria-label={`${SITE_NAME} loading`}
      aria-live="polite"
    >
      <div className="hz-boot__wash" />
      <div className="hz-boot__mesh" />
      <div className="hz-boot__caustic" />
      <div className="hz-boot__grain" />
      <div className="hz-boot__vignette" />

      <div className="hz-boot__stage">
        <div className="hz-boot__glow" />
        <img
          src="/images/houzzat-house-mark.png"
          alt=""
          width={220}
          height={220}
          className="hz-boot__mark"
        />
        <p className="hz-boot__word">{SITE_NAME}</p>
      </div>

      <style>{`
        .hz-boot {
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          overflow: hidden;
          display: grid;
          place-items: center;
          background: #0a2f24;
          color: #fff;
          pointer-events: auto;
          animation: hz-boot-in 420ms ease-out both;
        }
        .hz-boot[data-exiting="1"] {
          animation: hz-boot-out ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both;
          pointer-events: none;
        }
        .hz-boot__wash {
          position: absolute;
          inset: -12%;
          background:
            radial-gradient(120% 80% at 50% -10%, #3ecf8e 0%, transparent 42%),
            radial-gradient(90% 70% at 110% 90%, #0b3d2e 0%, transparent 50%),
            radial-gradient(80% 60% at -10% 80%, #145c44 0%, transparent 48%),
            linear-gradient(168deg, #166b4c 0%, #1a7b59 38%, #0f4d3a 72%, #08291f 100%);
          animation: hz-boot-ken 3.2s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .hz-boot__mesh {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse at 50% 42%, black 18%, transparent 72%);
          opacity: 0.35;
        }
        .hz-boot__caustic {
          position: absolute;
          inset: -30%;
          background:
            radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18), transparent 28%),
            radial-gradient(circle at 70% 75%, rgba(190,255,220,0.12), transparent 32%);
          filter: blur(18px);
          animation: hz-boot-drift 2.8s ease-in-out both;
        }
        .hz-boot__grain {
          position: absolute;
          inset: 0;
          opacity: 0.14;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        }
        .hz-boot__vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(4,16,12,0.55) 100%);
        }
        .hz-boot__stage {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-bottom: 8vh;
        }
        .hz-boot__glow {
          position: absolute;
          width: 280px;
          height: 280px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(255,255,255,0.28) 0%, rgba(62,207,142,0.18) 38%, transparent 68%);
          filter: blur(8px);
          animation: hz-boot-pulse 2.1s ease-in-out both;
        }
        .hz-boot__mark {
          position: relative;
          width: min(42vw, 188px);
          height: min(42vw, 188px);
          object-fit: contain;
          filter: drop-shadow(0 18px 40px rgba(0,0,0,0.28));
          animation: hz-boot-zoom 1.55s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .hz-boot__word {
          margin: 18px 0 0;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
          font-size: 1.05rem;
          font-weight: 650;
          letter-spacing: 0.42em;
          text-indent: 0.42em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.92);
          animation: hz-boot-word 1.1s 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes hz-boot-in {
          from { opacity: 0.92; }
          to { opacity: 1; }
        }
        @keyframes hz-boot-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes hz-boot-ken {
          from { transform: scale(1.18) translate3d(0, 8px, 0); }
          to { transform: scale(1) translate3d(0, 0, 0); }
        }
        @keyframes hz-boot-zoom {
          from { transform: scale(1.62); opacity: 0.35; filter: blur(10px) drop-shadow(0 18px 40px rgba(0,0,0,0.28)); }
          to { transform: scale(1); opacity: 1; filter: blur(0) drop-shadow(0 18px 40px rgba(0,0,0,0.28)); }
        }
        @keyframes hz-boot-pulse {
          0% { transform: scale(0.72); opacity: 0.15; }
          45% { transform: scale(1.08); opacity: 0.7; }
          100% { transform: scale(1); opacity: 0.45; }
        }
        @keyframes hz-boot-word {
          from { opacity: 0; letter-spacing: 0.7em; transform: translateY(10px); }
          to { opacity: 1; letter-spacing: 0.42em; transform: translateY(0); }
        }
        @keyframes hz-boot-drift {
          from { transform: translate3d(-4%, -3%, 0) scale(1.05); opacity: 0.35; }
          to { transform: translate3d(3%, 4%, 0) scale(1); opacity: 0.7; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hz-boot__wash, .hz-boot__mark, .hz-boot__word, .hz-boot__glow, .hz-boot__caustic {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
