import Capacitor
import Foundation
import os.log

@objc(BoardBlePlugin)
public class BoardBlePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BoardBlePlugin"
    public let jsName = "BoardBle"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelWrites", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureBoard", returnType: CAPPluginReturnPromise),
    ]

    private let logger = Logger(subsystem: "com.boardsesh.app", category: "BoardBlePlugin")

    public override func load() {
        BoardBleManager.shared.setEventHandlers(
            onScanResult: { [weak self] result in
                DispatchQueue.main.async {
                    self?.notifyListeners("scanResult", data: [
                        "device": [
                            "deviceId": result.deviceId,
                            "name": result.name ?? "",
                        ],
                        "localName": result.name ?? "",
                        "rssi": result.rssi,
                    ])
                }
            },
            onDisconnect: { [weak self] deviceId in
                DispatchQueue.main.async {
                    self?.notifyListeners("disconnected", data: ["deviceId": deviceId])
                }
            }
        )
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": BoardBleManager.shared.isAvailable])
    }

    @objc func startScan(_ call: CAPPluginCall) {
        let services = (call.getArray("services") ?? []).compactMap { $0 as? String }
        BoardBleManager.shared.startScan(serviceUuids: services) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    call.resolve()
                case .failure(let error):
                    self.logger.error("BLE scan failed: \(error.localizedDescription, privacy: .public)")
                    call.reject(error.localizedDescription)
                }
            }
        }
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        BoardBleManager.shared.stopScan()
        call.resolve()
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"), !deviceId.isEmpty else {
            call.reject("Missing required parameter: deviceId")
            return
        }

        BoardBleManager.shared.connect(deviceId: deviceId) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    call.resolve()
                case .failure(let error):
                    self.logger.error("BLE connect failed: \(error.localizedDescription, privacy: .public)")
                    call.reject(error.localizedDescription)
                }
            }
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        BoardBleManager.shared.disconnect {
            DispatchQueue.main.async {
                call.resolve()
            }
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), !value.isEmpty else {
            call.reject("Missing required parameter: value")
            return
        }

        BoardBleManager.shared.write(hex: value) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    call.resolve()
                case .failure(let error):
                    self.logger.error("BLE write failed: \(error.localizedDescription, privacy: .public)")
                    call.reject(error.localizedDescription)
                }
            }
        }
    }

    @objc func cancelWrites(_ call: CAPPluginCall) {
        BoardBleManager.shared.cancelWrites()
        call.resolve()
    }

    @objc func configureBoard(_ call: CAPPluginCall) {
        guard let boardName = call.getString("boardName"), !boardName.isEmpty else {
            call.reject("Missing required parameter: boardName")
            return
        }

        let layoutId = call.getInt("layoutId") ?? 0
        let sizeId = call.getInt("sizeId") ?? 0
        let apiLevel = call.getInt("apiLevel")
        let deviceName = call.getString("deviceName")
        let rawColorOverrides = call.getObject("colorOverrides") ?? [:]
        let colorOverrides = rawColorOverrides.reduce(into: [String: String]()) { result, entry in
            if let color = entry.value as? String {
                result[entry.key] = color
            }
        }

        BoardBleManager.shared.configure(
            BoardBleConfiguration(
                boardName: boardName,
                layoutId: layoutId,
                sizeId: sizeId,
                apiLevel: apiLevel,
                deviceName: deviceName,
                colorOverrides: colorOverrides
            )
        )
        call.resolve()
    }
}
