import Foundation
import Capacitor
import FirebaseMessaging

/// Capacitor bridge for the native FCM registration token.
/// JS name: `HouzzatFcm`. Houzzat iOS push-client posts this token, not APNs.
@objc(HouzzatFcmPlugin)
public class HouzzatFcmPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HouzzatFcmPlugin"
    public let jsName = "HouzzatFcm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onNativeFcmToken(_:)),
            name: HouzzatFirebaseMessaging.tokenDidChange,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func onNativeFcmToken(_ notification: Notification) {
        guard let token = notification.object as? String, !token.isEmpty else { return }
        notifyListeners("fcmToken", data: ["token": token])
    }

    @objc func getToken(_ call: CAPPluginCall) {
        if let token = HouzzatFirebaseMessaging.shared.fcmToken, !token.isEmpty {
            call.resolve(["token": token])
            return
        }
        Messaging.messaging().token { token, error in
            if let error {
                call.reject("FCM token unavailable", nil, error)
                return
            }
            guard let token, !token.isEmpty else {
                call.reject("FCM token unavailable")
                return
            }
            HouzzatFirebaseMessaging.shared.storeToken(token)
            call.resolve(["token": token])
        }
    }
}
