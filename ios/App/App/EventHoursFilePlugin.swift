import Capacitor
import UIKit

final class NoduBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(EventHoursFilePlugin())
    }
}

@objc(EventHoursFilePlugin)
final class EventHoursFilePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    let identifier = "EventHoursFilePlugin"
    let jsName = "EventHoursFile"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)]

    private var pending: (call: CAPPluginCall, directory: URL)?

    @objc func save(_ call: CAPPluginCall) {
        guard let filename = call.getString("filename"),
              filename == (filename as NSString).lastPathComponent,
              filename.lowercased().hasSuffix(".xlsx"),
              let base64 = call.getString("base64"),
              let bytes = Data(base64Encoded: base64) else {
            call.reject("Soubor s rozpisem hodin se nepodařilo přečíst.")
            return
        }
        let files = FileManager.default
        let directory = files.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let file = directory.appendingPathComponent(filename)
        do {
            try files.createDirectory(at: directory, withIntermediateDirectories: false)
            try bytes.write(to: file, options: .atomic)
        } catch {
            try? files.removeItem(at: directory)
            call.reject("Soubor s rozpisem hodin se nepodařilo připravit.", nil, error)
            return
        }

        DispatchQueue.main.async {
            guard self.pending == nil, let presenter = self.bridge?.viewController,
                  presenter.presentedViewController == nil else {
                try? files.removeItem(at: directory)
                call.reject("Dialog pro uložení souboru se nepodařilo otevřít.")
                return
            }
            self.pending = (call, directory)
            let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
            picker.delegate = self
            picker.isModalInPresentation = true
            presenter.present(picker, animated: true)
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        finish()
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish()
    }

    private func finish() {
        guard let pending else { return }
        self.pending = nil
        try? FileManager.default.removeItem(at: pending.directory)
        pending.call.resolve()
    }
}
