package app.lyre.songbook;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges Android's ACTION_SEND intent (Chrome's "Share" menu) into JS as a
 * `shareReceived` event (task F2, docs/PLAN-v0.4.md — the release's central
 * feature: "share a chord-chart page into Lyre").
 *
 * Hand-rolled instead of the community `send-intent` package
 * (`@mindlib-capacitor/send-intent`, evaluated 2026-08-01): that package
 * genuinely does claim Capacitor 8 support (`peerDependencies.@capacitor/core
 * >= 8.0.0`, published 2026-01, so not stale) — but its Android integration
 * requires declaring a *second*, separate Activity it owns
 * (`de.mindlib.sendIntent.SendIntentActivity`, a hardcoded class name in a
 * stranger's package, "do not change this name, otherwise your application
 * will crash"), which then hands off to the real app, and its own README
 * documents the exact cold/warm-start pitfall this task needs to get right
 * as an open footgun ("can lead to app state issues... or trigger the same
 * intent again"), recommending the caller manually call `SendIntent.finish()`
 * to work around it. Its result shape also overloads a single `url` field for
 * both shared web links and shared file URIs. Capacitor's own official,
 * documented `Plugin#handleOnNewIntent` hook (see below) already covers both
 * launch paths through the *same* Activity Capacitor itself owns, with no
 * extra library, no second Activity, no manual `finish()` bookkeeping, and an
 * unambiguous single string payload — about 30 lines here versus adopting an
 * external dependency with a materially more fragile Android integration for
 * the one thing this task most needs to be reliable.
 *
 * No `load()` override is needed: `BridgeActivity#load()` (called from
 * `onCreate`, after the Bridge — and therefore this plugin — is built) calls
 * `this.onNewIntent(getIntent())` itself once, which routes through
 * `Bridge#onNewIntent` to every plugin's `handleOnNewIntent`. So a cold start
 * arrives through the exact same method as a warm start
 * (`BridgeActivity#onNewIntent`, called by Android directly because
 * `MainActivity` is `launchMode="singleTask"` in `AndroidManifest.xml`) —
 * one method handles both.
 *
 * `notifyListeners(..., retainUntilConsumed=true)` (Capacitor's standard
 * pattern, same one `@capacitor/app`'s own `appUrlOpen` uses) means a
 * cold-start share fired before the JS side has attached its listener isn't
 * lost — Capacitor queues it and delivers it to the first listener added.
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null) return;

        String action = intent.getAction();
        String type = intent.getType();
        if (!Intent.ACTION_SEND.equals(action) || type == null || !type.startsWith("text/plain")) {
            return;
        }

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;

        JSObject data = new JSObject();
        data.put("text", text);
        notifyListeners("shareReceived", data, true);
    }
}
