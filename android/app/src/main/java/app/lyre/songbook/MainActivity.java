package app.lyre.songbook;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Register the share-to-app plugin (task F2, docs/PLAN-v0.4.md) before
    // `super.onCreate()` builds the Bridge — the documented Capacitor pattern
    // for a custom plugin (mirrors how `initialPlugins`/`registerPlugin`
    // calls are expected to run ahead of `BridgeActivity#load()`). See
    // `ShareReceiverPlugin`'s own doc comment for why this is a hand-rolled
    // plugin rather than the community `send-intent` package, and for why no
    // further wiring (no `onNewIntent` override here) is needed: `load()`
    // already calls `onNewIntent(getIntent())` once for the cold-start
    // Intent, and `BridgeActivity#onNewIntent` (Android calls it directly on
    // a `singleTask` activity, already set below) handles the warm-start
    // case — both paths converge on `Bridge#onNewIntent`, which invokes
    // every registered plugin's `handleOnNewIntent`.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareReceiverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
