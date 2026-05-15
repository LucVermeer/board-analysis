import CoreBluetooth
import Foundation
import os.log

struct BoardBleScanResult {
    let deviceId: String
    let name: String?
    let rssi: Int
}

enum BoardBleError: LocalizedError {
    case bluetoothUnavailable
    case deviceNotFound
    case connectTimedOut
    case uartServiceMissing
    case writeCharacteristicMissing
    case notConnected
    case invalidHex
    case writeCancelled

    var errorDescription: String? {
        switch self {
        case .bluetoothUnavailable:
            return "Bluetooth is not available"
        case .deviceNotFound:
            return "Bluetooth device was not found"
        case .connectTimedOut:
            return "Bluetooth connection timed out"
        case .uartServiceMissing:
            return "UART service was not found"
        case .writeCharacteristicMissing:
            return "UART write characteristic was not found"
        case .notConnected:
            return "No board is connected"
        case .invalidHex:
            return "Invalid hex payload"
        case .writeCancelled:
            return "BLE write cancelled"
        }
    }
}

final class BoardBleManager: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    static let shared = BoardBleManager()

    private struct WriteRequest {
        let chunks: [Data]
        let connectionGeneration: UInt64
        let writeGeneration: UInt64
        let completion: (Error?) -> Void
    }

    private let logger = Logger(subsystem: "com.boardsesh.app", category: "BoardBleManager")
    private let auroraServiceUuid = CBUUID(string: "4488B571-7806-4DF6-BCFF-A2897E4953FF")
    private let uartServiceUuid = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    private let uartWriteCharacteristicUuid = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
    private let chunkSize = 20
    private let chunkDelay: TimeInterval = 0.005
    private let connectTimeout: TimeInterval = 8
    private let reconnectDelays: [TimeInterval] = [1, 2, 5, 10, 20, 30]

    private lazy var centralManager = CBCentralManager(
        delegate: self,
        queue: .main,
        options: [CBCentralManagerOptionRestoreIdentifierKey: "com.boardsesh.app.board-ble"]
    )

    private var discoveredPeripherals: [String: CBPeripheral] = [:]
    private var discoveredNames: [String: String] = [:]
    private var connectedPeripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var pendingConnectCompletion: ((Result<Void, Error>) -> Void)?
    private var connectTimeoutWorkItem: DispatchWorkItem?
    private var scanRequested = false
    private var scanServices: [CBUUID] = []
    private var intentionalDisconnectGenerations: [UUID: UInt64] = [:]
    private var peripheralGenerations: [UUID: UInt64] = [:]
    private var connectionGeneration: UInt64 = 0
    private var reconnectAttempt = 0
    private var writeQueue: [WriteRequest] = []
    private var writeGeneration: UInt64 = 0
    private var isWriting = false
    private var pendingWriteResume: (() -> Void)?
    private var configuration: BoardBleConfiguration?
    private var observingBoardBleDisplayNotification = false

    var onScanResult: ((BoardBleScanResult) -> Void)?
    var onDisconnect: ((String) -> Void)?

    override private init() {
        super.init()
        runOnMainSync {
            configuration = readConfiguration()
            startBoardBleDisplayObservation()
            _ = centralManager
        }
    }

    deinit {
        stopBoardBleDisplayObservation()
    }

    var isAvailable: Bool {
        runOnMainSync {
            isAvailableOnMain
        }
    }

    var connectedDeviceId: String? {
        runOnMainSync {
            connectedPeripheral?.identifier.uuidString
        }
    }

    func configure(_ configuration: BoardBleConfiguration) {
        runOnMain { [weak self] in
            guard let self else { return }
            self.configuration = configuration
            self.writeConfiguration(configuration)
            self.displaySharedCurrentItemOnMain()
        }
    }

    func startScan(serviceUuids: [String], completion: @escaping (Result<Void, Error>) -> Void) {
        runOnMain { [weak self] in
            self?.startScanOnMain(serviceUuids: serviceUuids, completion: completion)
        }
    }

    func stopScan() {
        runOnMain { [weak self] in
            self?.stopScanOnMain()
        }
    }

    func connect(deviceId: String, completion: @escaping (Result<Void, Error>) -> Void) {
        runOnMain { [weak self] in
            self?.connectOnMain(deviceId: deviceId, completion: completion)
        }
    }

    func disconnect(completion: (() -> Void)? = nil) {
        runOnMain { [weak self] in
            self?.disconnectOnMain(completion: completion)
        }
    }

    func write(hex: String, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let data = Data(hexString: hex) else {
            completion(.failure(BoardBleError.invalidHex))
            return
        }
        write(data: data) { error in
            if let error {
                completion(.failure(error))
            } else {
                completion(.success(()))
            }
        }
    }

    func write(data: Data, completion: ((Error?) -> Void)? = nil) {
        runOnMain { [weak self] in
            self?.writeOnMain(data: data, completion: completion)
        }
    }

    func cancelWrites() {
        runOnMain { [weak self] in
            self?.failQueuedWrites(BoardBleError.writeCancelled)
        }
    }

    func displaySharedCurrentItem() {
        runOnMain { [weak self] in
            self?.displaySharedCurrentItemOnMain()
        }
    }

    func displayCurrentItem(items: [SharedQueueItem], currentIndex: Int) {
        runOnMain { [weak self] in
            self?.displayCurrentItemOnMain(items: items, currentIndex: currentIndex)
        }
    }

    func display(item: SharedQueueItem) {
        runOnMain { [weak self] in
            self?.displayItemOnMain(item)
        }
    }

    private var isAvailableOnMain: Bool {
        switch centralManager.state {
        case .poweredOn, .unknown, .resetting:
            return true
        case .poweredOff, .unsupported, .unauthorized:
            return false
        @unknown default:
            return false
        }
    }

    private func startScanOnMain(serviceUuids: [String], completion: @escaping (Result<Void, Error>) -> Void) {
        let uuids = serviceUuids.compactMap { CBUUID(string: $0) }
        scanServices = uuids.isEmpty ? [auroraServiceUuid] : uuids
        scanRequested = true

        guard centralManager.state == .poweredOn else {
            if isAvailableOnMain {
                completion(.success(()))
            } else {
                completion(.failure(BoardBleError.bluetoothUnavailable))
            }
            return
        }

        centralManager.scanForPeripherals(withServices: scanServices, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        completion(.success(()))
    }

    private func stopScanOnMain() {
        scanRequested = false
        if centralManager.isScanning {
            centralManager.stopScan()
        }
    }

    private func connectOnMain(deviceId: String, completion: @escaping (Result<Void, Error>) -> Void) {
        guard centralManager.state == .poweredOn else {
            completion(.failure(BoardBleError.bluetoothUnavailable))
            return
        }

        if connectedPeripheral?.identifier.uuidString == deviceId, writeCharacteristic != nil {
            completion(.success(()))
            displaySharedCurrentItemOnMain()
            return
        }

        guard let peripheral = discoveredPeripherals[deviceId] else {
            completion(.failure(BoardBleError.deviceNotFound))
            return
        }

        stopScanOnMain()
        failQueuedWrites(BoardBleError.writeCancelled)
        connectionGeneration += 1
        let generation = connectionGeneration
        pendingConnectCompletion = completion
        connectedPeripheral = peripheral
        writeCharacteristic = nil
        peripheralGenerations[peripheral.identifier] = generation
        peripheral.delegate = self

        let timeoutWorkItem = DispatchWorkItem { [weak self] in
            guard let self else { return }
            guard self.pendingConnectCompletion != nil else { return }
            guard self.peripheralGenerations[peripheral.identifier] == generation else { return }
            self.centralManager.cancelPeripheralConnection(peripheral)
            self.completePendingConnect(.failure(BoardBleError.connectTimedOut))
        }
        connectTimeoutWorkItem = timeoutWorkItem
        DispatchQueue.main.asyncAfter(deadline: .now() + connectTimeout, execute: timeoutWorkItem)

        centralManager.connect(peripheral, options: [
            CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
        ])
    }

    private func disconnectOnMain(completion: (() -> Void)? = nil) {
        connectionGeneration += 1
        reconnectAttempt = 0
        stopScanOnMain()
        failQueuedWrites(BoardBleError.notConnected)
        completePendingConnect(.failure(BoardBleError.notConnected))

        guard let peripheral = connectedPeripheral else {
            writeCharacteristic = nil
            completion?()
            return
        }

        intentionalDisconnectGenerations[peripheral.identifier] = connectionGeneration
        peripheralGenerations[peripheral.identifier] = connectionGeneration
        centralManager.cancelPeripheralConnection(peripheral)
        writeCharacteristic = nil
        connectedPeripheral = nil
        completion?()
    }

    private func writeOnMain(data: Data, completion: ((Error?) -> Void)? = nil) {
        guard connectedPeripheral != nil, writeCharacteristic != nil else {
            completion?(BoardBleError.notConnected)
            return
        }

        let chunks = stride(from: 0, to: data.count, by: chunkSize).map { offset in
            data.subdata(in: offset..<min(offset + chunkSize, data.count))
        }

        writeQueue.append(
            WriteRequest(
                chunks: chunks,
                connectionGeneration: connectionGeneration,
                writeGeneration: writeGeneration,
                completion: completion ?? { _ in }
            )
        )
        processWriteQueue()
    }

    private func displaySharedCurrentItemOnMain() {
        guard let defaults = SharedConstants.sharedDefaults else { return }
        let (items, currentIndex) = SharedQueueState.load(from: defaults)
        displayCurrentItemOnMain(items: items, currentIndex: currentIndex)
    }

    private func displayCurrentItemOnMain(items: [SharedQueueItem], currentIndex: Int) {
        guard currentIndex >= 0, currentIndex < items.count else { return }
        displayItemOnMain(items[currentIndex])
    }

    private func displayItemOnMain(_ item: SharedQueueItem) {
        guard let configuration else { return }
        guard connectedPeripheral != nil, writeCharacteristic != nil else { return }

        let ledPlacements = BoardPlacementData.getLedPlacements(
            boardName: configuration.boardName,
            layoutId: configuration.layoutId,
            sizeId: configuration.sizeId
        )
        guard !ledPlacements.isEmpty || item.frames.isEmpty else {
            logger.error("Missing LED placement data for \(configuration.boardName, privacy: .public) layout=\(configuration.layoutId, privacy: .public) size=\(configuration.sizeId, privacy: .public)")
            return
        }

        let framesToSend: String
        if item.mirrored {
            guard let mirroredFrames = BoardBleEncoding.mirroredFrames(
                frames: item.frames,
                boardName: configuration.boardName,
                layoutId: configuration.layoutId
            ) else {
                logger.warning("Cannot mirror frames for climb \(item.climbUuid, privacy: .public)")
                return
            }
            framesToSend = mirroredFrames
        } else {
            framesToSend = item.frames
        }

        let connectedDeviceName: String?
        if let connectedPeripheral {
            connectedDeviceName = discoveredNames[connectedPeripheral.identifier.uuidString] ?? connectedPeripheral.name
        } else {
            connectedDeviceName = nil
        }
        let apiLevel = configuration.apiLevel ?? BoardBleEncoding.parseApiLevel(
            deviceName: connectedDeviceName ?? configuration.deviceName
        )
        let result = BoardBleEncoding.makeAuroraPacket(
            frames: framesToSend,
            placementPositions: ledPlacements,
            boardName: configuration.boardName,
            apiLevel: apiLevel,
            colorOverrides: configuration.colorOverrides
        )

        guard !result.packet.isEmpty || framesToSend.isEmpty else {
            logger.warning("Skipping BLE write because no placements resolved for climb \(item.climbUuid, privacy: .public)")
            return
        }

        writeOnMain(data: result.packet) { [weak self] error in
            if let error {
                self?.logger.error("BLE write failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn, scanRequested {
            central.scanForPeripherals(withServices: scanServices.isEmpty ? [auroraServiceUuid] : scanServices, options: [
                CBCentralManagerScanOptionAllowDuplicatesKey: true,
            ])
        }
    }

    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        guard let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral],
              let peripheral = peripherals.first
        else {
            return
        }

        let deviceId = peripheral.identifier.uuidString
        connectionGeneration += 1
        peripheralGenerations[peripheral.identifier] = connectionGeneration
        discoveredPeripherals[deviceId] = peripheral
        connectedPeripheral = peripheral
        peripheral.delegate = self
        logger.info("Restored BLE peripheral \(deviceId, privacy: .public)")
        peripheral.discoverServices([uartServiceUuid])
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let deviceId = peripheral.identifier.uuidString
        let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let name = localName ?? peripheral.name
        discoveredPeripherals[deviceId] = peripheral
        if let name {
            discoveredNames[deviceId] = name
        }
        onScanResult?(BoardBleScanResult(deviceId: deviceId, name: name, rssi: RSSI.intValue))
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard peripheralGenerations[peripheral.identifier] == connectionGeneration else {
            central.cancelPeripheralConnection(peripheral)
            return
        }
        reconnectAttempt = 0
        peripheral.delegate = self
        peripheral.discoverServices([uartServiceUuid])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        guard peripheralGenerations[peripheral.identifier] == connectionGeneration else { return }
        completePendingConnect(.failure(error ?? BoardBleError.notConnected))
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        let deviceId = peripheral.identifier.uuidString
        let wasCurrentPeripheral = connectedPeripheral?.identifier == peripheral.identifier
        let intentionalDisconnectGeneration = intentionalDisconnectGenerations.removeValue(forKey: peripheral.identifier)

        if let intentionalDisconnectGeneration {
            if peripheralGenerations[peripheral.identifier] == intentionalDisconnectGeneration {
                peripheralGenerations.removeValue(forKey: peripheral.identifier)
            }
            return
        }

        guard wasCurrentPeripheral else {
            peripheralGenerations.removeValue(forKey: peripheral.identifier)
            return
        }

        connectedPeripheral = nil
        writeCharacteristic = nil
        failQueuedWrites(error ?? BoardBleError.notConnected)
        onDisconnect?(deviceId)

        scheduleReconnect(peripheral, generation: connectionGeneration)
    }

    // MARK: - CBPeripheralDelegate

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard connectedPeripheral?.identifier == peripheral.identifier else { return }
        if let error {
            completePendingConnect(.failure(error))
            return
        }

        guard let service = peripheral.services?.first(where: { $0.uuid == uartServiceUuid }) else {
            completePendingConnect(.failure(BoardBleError.uartServiceMissing))
            return
        }

        peripheral.discoverCharacteristics([uartWriteCharacteristicUuid], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard connectedPeripheral?.identifier == peripheral.identifier else { return }
        if let error {
            completePendingConnect(.failure(error))
            return
        }

        guard let characteristic = service.characteristics?.first(where: { $0.uuid == uartWriteCharacteristicUuid }) else {
            completePendingConnect(.failure(BoardBleError.writeCharacteristicMissing))
            return
        }

        connectedPeripheral = peripheral
        writeCharacteristic = characteristic
        completePendingConnect(.success(()))
        logger.info("Connected to board BLE peripheral \(peripheral.identifier.uuidString, privacy: .public)")
        displaySharedCurrentItemOnMain()
    }

    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        let resume = pendingWriteResume
        pendingWriteResume = nil
        resume?()
    }

    // MARK: - Private

    private func runOnMain(_ operation: @escaping () -> Void) {
        if Thread.isMainThread {
            operation()
        } else {
            DispatchQueue.main.async {
                operation()
            }
        }
    }

    private func runOnMainSync<T>(_ operation: () -> T) -> T {
        if Thread.isMainThread {
            return operation()
        }
        return DispatchQueue.main.sync(execute: operation)
    }

    private func startBoardBleDisplayObservation() {
        guard !observingBoardBleDisplayNotification else { return }
        observingBoardBleDisplayNotification = true

        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let name = CFNotificationName(SharedConstants.boardBleDisplayNotification as CFString)
        let observer = Unmanaged.passUnretained(self).toOpaque()

        CFNotificationCenterAddObserver(
            center,
            observer,
            { (_, observer, _, _, _) in
                guard let observer = observer else { return }
                let manager = Unmanaged<BoardBleManager>.fromOpaque(observer).takeUnretainedValue()
                manager.displaySharedCurrentItem()
            },
            name.rawValue,
            nil,
            .deliverImmediately
        )
    }

    private func stopBoardBleDisplayObservation() {
        guard observingBoardBleDisplayNotification else { return }
        observingBoardBleDisplayNotification = false

        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()
        let name = CFNotificationName(SharedConstants.boardBleDisplayNotification as CFString)
        CFNotificationCenterRemoveObserver(center, observer, name, nil)
    }

    private func completePendingConnect(_ result: Result<Void, Error>) {
        connectTimeoutWorkItem?.cancel()
        connectTimeoutWorkItem = nil
        let completion = pendingConnectCompletion
        pendingConnectCompletion = nil
        completion?(result)
    }

    private func scheduleReconnect(_ peripheral: CBPeripheral, generation: UInt64) {
        guard reconnectAttempt < reconnectDelays.count else { return }
        let delay = reconnectDelays[reconnectAttempt]
        reconnectAttempt += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self, weak peripheral] in
            guard let self, let peripheral, self.connectionGeneration == generation else { return }
            self.connectedPeripheral = peripheral
            peripheral.delegate = self
            self.peripheralGenerations[peripheral.identifier] = generation
            self.centralManager.connect(peripheral, options: [
                CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
            ])
        }
    }

    private func processWriteQueue() {
        guard !isWriting, !writeQueue.isEmpty else { return }
        isWriting = true
        let request = writeQueue[0]
        writeChunk(
            requestIndex: 0,
            chunkIndex: 0,
            connectionGeneration: request.connectionGeneration,
            writeGeneration: request.writeGeneration
        )
    }

    private func writeChunk(
        requestIndex: Int,
        chunkIndex: Int,
        connectionGeneration: UInt64,
        writeGeneration: UInt64
    ) {
        guard connectionGeneration == self.connectionGeneration, writeGeneration == self.writeGeneration else { return }
        guard requestIndex < writeQueue.count else {
            isWriting = false
            return
        }
        let request = writeQueue[requestIndex]
        guard request.connectionGeneration == connectionGeneration, request.writeGeneration == writeGeneration else { return }

        guard let peripheral = connectedPeripheral, let characteristic = writeCharacteristic else {
            let request = writeQueue.removeFirst()
            request.completion(BoardBleError.notConnected)
            isWriting = false
            processWriteQueue()
            return
        }

        guard chunkIndex < request.chunks.count else {
            _ = writeQueue.removeFirst()
            request.completion(nil)
            isWriting = false
            processWriteQueue()
            return
        }

        guard peripheral.canSendWriteWithoutResponse else {
            pendingWriteResume = { [weak self] in
                self?.writeChunk(
                    requestIndex: requestIndex,
                    chunkIndex: chunkIndex,
                    connectionGeneration: connectionGeneration,
                    writeGeneration: writeGeneration
                )
            }
            return
        }

        peripheral.writeValue(request.chunks[chunkIndex], for: characteristic, type: .withoutResponse)
        DispatchQueue.main.asyncAfter(deadline: .now() + chunkDelay) { [weak self] in
            self?.writeChunk(
                requestIndex: requestIndex,
                chunkIndex: chunkIndex + 1,
                connectionGeneration: connectionGeneration,
                writeGeneration: writeGeneration
            )
        }
    }

    private func failQueuedWrites(_ error: Error) {
        writeGeneration += 1
        let queuedWrites = writeQueue
        writeQueue = []
        isWriting = false
        pendingWriteResume = nil
        for request in queuedWrites {
            request.completion(error)
        }
    }

    private func readConfiguration() -> BoardBleConfiguration? {
        guard let defaults = SharedConstants.sharedDefaults,
              let data = defaults.data(forKey: SharedConstants.bleBoardConfigKey)
        else {
            return nil
        }
        return try? JSONDecoder().decode(BoardBleConfiguration.self, from: data)
    }

    private func writeConfiguration(_ configuration: BoardBleConfiguration) {
        guard let defaults = SharedConstants.sharedDefaults,
              let data = try? JSONEncoder().encode(configuration)
        else {
            return
        }
        defaults.set(data, forKey: SharedConstants.bleBoardConfigKey)
    }
}

private extension Data {
    init?(hexString: String) {
        let clean = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count % 2 == 0 else { return nil }

        var bytes: [UInt8] = []
        bytes.reserveCapacity(clean.count / 2)
        var index = clean.startIndex

        while index < clean.endIndex {
            let nextIndex = clean.index(index, offsetBy: 2)
            guard let byte = UInt8(clean[index..<nextIndex], radix: 16) else { return nil }
            bytes.append(byte)
            index = nextIndex
        }

        self = Data(bytes)
    }
}
