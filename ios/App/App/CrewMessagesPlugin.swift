import Capacitor
import MessageUI

@objc(CrewMessagesPlugin)
final class CrewMessagesPlugin: CAPPlugin, CAPBridgedPlugin, MFMessageComposeViewControllerDelegate {
    let identifier = "CrewMessagesPlugin"
    let jsName = "CrewMessages"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "compose", returnType: CAPPluginReturnPromise)]

    private var pendingCall: CAPPluginCall?

    @objc func compose(_ call: CAPPluginCall) {
        guard let recipients = call.getArray("recipients", String.self), !recipients.isEmpty else {
            call.reject("Chybí telefonní čísla příjemců.")
            return
        }
        DispatchQueue.main.async {
            guard MFMessageComposeViewController.canSendText() else {
                call.reject("Na tomto zařízení nelze odesílat zprávy.")
                return
            }
            guard self.pendingCall == nil, let presenter = self.bridge?.viewController,
                  presenter.viewIfLoaded?.window != nil, presenter.presentedViewController == nil else {
                call.reject("Zprávy se nepodařilo otevřít.")
                return
            }
            let composer = MFMessageComposeViewController()
            composer.recipients = recipients
            composer.messageComposeDelegate = self
            composer.isModalInPresentation = true
            self.pendingCall = call
            presenter.present(composer, animated: true)
        }
    }

    func messageComposeViewController(_ controller: MFMessageComposeViewController,
                                      didFinishWith result: MessageComposeResult) {
        controller.dismiss(animated: true) {
            let call = self.pendingCall
            self.pendingCall = nil
            if result == .failed {
                call?.reject("Zprávu se nepodařilo odeslat.")
            } else {
                call?.resolve()
            }
        }
    }
}
