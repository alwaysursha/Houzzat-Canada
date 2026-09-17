import Foundation
import FirebaseCore
import FirebaseMessaging

/// Native FCM token holder for Houzzat iOS.
/// Capacitor PushNotifications still receives the APNs device token unchanged.
final class HouzzatFirebaseMessaging: NSObject, MessagingDelegate {
    static let shared = HouzzatFirebaseMessaging()
    static let tokenDidChange = Notification.Name("HouzzatFcmTokenDidChange")

    private(set) var fcmToken: String?

    private override init() {
        super.init()
    }

    func configureIfNeeded() {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        Messaging.messaging().delegate = self
    }

    func setApnsToken(_ deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        refreshToken()
    }

    func refreshToken() {
        Messaging.messaging().token { [weak self] token, error in
            guard let self, let token, error == nil, !token.isEmpty else { return }
            self.storeToken(token)
        }
    }

    func storeToken(_ token: String) {
        fcmToken = token
        NotificationCenter.default.post(name: Self.tokenDidChange, object: token)
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken, !fcmToken.isEmpty else { return }
        storeToken(fcmToken)
    }
}
