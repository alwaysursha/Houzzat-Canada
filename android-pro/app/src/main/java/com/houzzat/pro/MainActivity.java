package com.houzzat.pro;

import android.net.Uri;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import java.lang.reflect.Method;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Production HouzzatPRO ({@code com.houzzat.pro}).
 *
 * <p>Capacitor 8 registers {@code DOCUMENT_START_SCRIPT} for the single
 * {@code server.url} origin ({@code https://app.houzzatpro.com}), then disables
 * HTML-proxy bridge injection. Post-login navigation to tenant hosts listed in
 * {@code server.allowNavigation} (e.g. {@code https://houzzat.com/agent}) is
 * intentional, but those origins never received the real native bridge — so
 * {@code window.Capacitor.triggerEvent} was missing and lifecycle notify failed.
 *
 * <p>This activity re-registers Capacitor's own injector script for the remaining
 * allowNavigation origins (excluding the server origin already handled by Bridge).
 * Proven on the Private sideload shell; Firebase remains via google-services.json.
 */
public class MainActivity extends BridgeActivity {

    private boolean didRegisterAllowNavigationBridge;

    @Override
    protected void load() {
        super.load();
        registerNativeBridgeForAllowNavigationOrigins();
    }

    private void registerNativeBridgeForAllowNavigationOrigins() {
        if (didRegisterAllowNavigationBridge || bridge == null) {
            return;
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            // Capacitor keeps the HTML-proxy injector on WebViews without document-start.
            return;
        }

        String[] allowNavigation = bridge.getConfig().getAllowNavigation();
        if (allowNavigation == null || allowNavigation.length == 0) {
            return;
        }

        String serverOrigin = serverOrigin(bridge);
        if (serverOrigin == null) {
            Logger.error("Pro: missing server.url origin; cannot extend Capacitor bridge");
            return;
        }

        Set<String> extraOrigins = new LinkedHashSet<>();
        for (String rule : allowNavigation) {
            if (rule == null || rule.trim().isEmpty()) {
                continue;
            }
            String originRule = rule.startsWith("http://") || rule.startsWith("https://")
                ? rule
                : "https://" + rule;
            if (coversOrigin(originRule, serverOrigin)) {
                // Bridge already registered document-start for server.url — avoid double inject.
                continue;
            }
            // Skip OAuth / Google hosts; CRM bridge is only required on Houzzat origins.
            String hostPart = hostFromOriginRule(originRule);
            if (hostPart != null && hostPart.contains("google")) {
                continue;
            }
            extraOrigins.add(originRule);
        }

        if (extraOrigins.isEmpty()) {
            return;
        }

        String script = capacitorInjectorScript(bridge);
        if (script == null || script.isEmpty()) {
            Logger.error("Pro: unable to read Capacitor injector script; bridge not extended");
            return;
        }

        try {
            WebView webView = bridge.getWebView();
            WebViewCompat.addDocumentStartJavaScript(webView, script, extraOrigins);
            didRegisterAllowNavigationBridge = true;
            Logger.debug(
                "Pro: Capacitor document-start bridge registered for allowNavigation origins: " +
                    extraOrigins
            );
        } catch (IllegalArgumentException ex) {
            Logger.error("Pro: invalid allowNavigation origin for document-start bridge", ex);
        } catch (Exception ex) {
            Logger.error("Pro: failed to register Capacitor bridge on allowNavigation origins", ex);
        }
    }

    /** Same origin derivation Capacitor uses for DOCUMENT_START_SCRIPT. */
    private static String serverOrigin(Bridge bridge) {
        String serverUrl = bridge.getConfig().getServerUrl();
        if (serverUrl == null || serverUrl.trim().isEmpty()) {
            return null;
        }
        Uri uri = Uri.parse(serverUrl);
        if (uri.getScheme() == null || uri.getAuthority() == null) {
            return null;
        }
        return uri.buildUpon().path(null).fragment(null).clearQuery().build().toString();
    }

    /**
     * True when {@code originRule} would also match Capacitor's already-registered
     * server origin (exact host or {@code *.parent} wildcard).
     */
    private static boolean coversOrigin(String originRule, String serverOrigin) {
        Uri server = Uri.parse(serverOrigin);
        String serverHost = server.getHost();
        if (serverHost == null) {
            return false;
        }
        serverHost = serverHost.toLowerCase(Locale.ROOT);

        String ruleHost = hostFromOriginRule(originRule);
        if (ruleHost == null) {
            return false;
        }
        ruleHost = ruleHost.toLowerCase(Locale.ROOT);

        if (ruleHost.equals(serverHost)) {
            return true;
        }
        if (ruleHost.startsWith("*.")) {
            String suffix = ruleHost.substring(1); // ".houzzatpro.com"
            return serverHost.endsWith(suffix) && serverHost.length() > suffix.length();
        }
        return false;
    }

    private static String hostFromOriginRule(String originRule) {
        // Patterns like https://*.houzzat.com are not valid URIs for Uri.parse host.
        String trimmed = originRule;
        if (trimmed.startsWith("https://")) {
            trimmed = trimmed.substring("https://".length());
        } else if (trimmed.startsWith("http://")) {
            trimmed = trimmed.substring("http://".length());
        }
        int slash = trimmed.indexOf('/');
        if (slash >= 0) {
            trimmed = trimmed.substring(0, slash);
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Capacitor's real injector script (global + native-bridge + plugins), via the
     * same private Bridge#getJSInjector path Bridge.loadWebView uses.
     */
    private static String capacitorInjectorScript(Bridge bridge) {
        try {
            Method getJSInjector = Bridge.class.getDeclaredMethod("getJSInjector");
            getJSInjector.setAccessible(true);
            Object injector = getJSInjector.invoke(bridge);
            if (injector == null) {
                return null;
            }
            Method getScriptString = injector.getClass().getMethod("getScriptString");
            Object script = getScriptString.invoke(injector);
            return script instanceof String ? (String) script : null;
        } catch (ReflectiveOperationException ex) {
            Logger.error("Pro: reflection failed reading Capacitor injector script", ex);
            return null;
        }
    }
}
