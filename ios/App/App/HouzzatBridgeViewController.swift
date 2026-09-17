import Capacitor

/// Capacitor 8 local-plugin hook: App-target plugins are not in packageClassList.
final class HouzzatBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(HouzzatFcmPlugin())
    }
}
