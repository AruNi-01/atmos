import Foundation
import Darwin
import CoreVideo
import CoreMedia
import Accelerate
import VideoToolbox
import LiveKitWebRTC

private let webRTCDebugEnabled: Bool = {
    switch ProcessInfo.processInfo.environment["SERVE_SIM_WEBRTC_DEBUG"]?
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased() {
    case "1", "true", "yes", "on": true
    default: false
    }
}()

private func streamLog(_ message: @autoclosure () -> String) {
    if webRTCDebugEnabled { print(message()) }
}

struct WebRTCIceServerPayload: Codable {
    let urls: [String]
    let username: String?
    let credential: String?
}

private let defaultWebRTCIceServers = [
    WebRTCIceServerPayload(urls: ["stun:stun.l.google.com:19302"], username: nil, credential: nil),
    WebRTCIceServerPayload(urls: ["stun:stun1.l.google.com:19302"], username: nil, credential: nil),
]

struct WebRTCOfferPayload: Codable {
    let type: String
    let sdp: String
    let sessionId: String
    let codec: String?
    let iceServers: [WebRTCIceServerPayload]?
}

struct WebRTCAnswerPayload: Codable {
    let type: String
    let sdp: String
}

private final class WebRTCSignalingCompletion: @unchecked Sendable {
    private let lock = NSLock()
    private var completed = false
    private let body: (Result<WebRTCAnswerPayload, Error>) -> Void

    init(_ body: @escaping (Result<WebRTCAnswerPayload, Error>) -> Void) {
        self.body = body
    }

    func resume(with result: Result<WebRTCAnswerPayload, Error>) -> Bool {
        lock.lock()
        if completed {
            lock.unlock()
            return false
        }
        completed = true
        lock.unlock()
        body(result)
        return true
    }
}

private struct PendingWebRTCFrame {
    let pixelBuffer: CVPixelBuffer
    let timestamp: CMTime
}

private struct PendingWebRTCOffer {
    let session: WebRTCSession
    let completion: (Result<WebRTCAnswerPayload, Error>) -> Void
}

final class WebRTCPublisher: @unchecked Sendable {
    private static let signalingTimeoutMs = 10_000
    private static let connectionTimeoutMs = 10_000

    private let queue = DispatchQueue(label: "webrtc-publisher")
    private let factory: LKRTCPeerConnectionFactory
    private let videoSource: LKRTCVideoSource
    private let videoTrack: LKRTCVideoTrack
    private let capturer: LKRTCVideoCapturer
    private var sessions: [String: WebRTCSession] = [:]
    private var pendingOffer: PendingWebRTCOffer?
    private var cancelledSessionIds = Set<String>()
    private var cancelledSessionIdOrder: [String] = []
    private let frameLock = NSLock()
    private var acceptsFrames = false
    private var pendingFrame: PendingWebRTCFrame?
    private var framePumpScheduled = false
    private var lastSentFrameAtNs: UInt64 = 0
    private var lastOutputWidth = 0
    private var lastOutputHeight = 0
    private var sentFrameCount: Int64 = 0
    private var lastFrameTimestampNs: Int64 = 0
    private var lastInputPixelFormat: OSType?
    private var useNativePixelBufferFrames: Bool?
    private let h264PixelBufferConverter = H264WebRTCPixelBufferConverter()
    private lazy var h264WebRTCSupport = Self.detectH264WebRTCSupport()
    private let h264FrameModeOverride: H264WebRTCFrameMode?
    private var maxFps: Int
    private var targetBitrate: Int
    private var maxDimension: Int
    private var frameIntervalNs: UInt64

    init(maxFps: Int, targetBitrate: Int, maxDimension: Int) {
        let normalizedMaxFps = max(1, min(120, maxFps))
        self.maxFps = normalizedMaxFps
        self.targetBitrate = max(100_000, targetBitrate)
        self.maxDimension = max(0, maxDimension)
        self.frameIntervalNs = UInt64(1_000_000_000 / normalizedMaxFps)
        h264FrameModeOverride = Self.h264FrameModeOverride()
        let defaultEncoderFactory = LKRTCDefaultVideoEncoderFactory()
        let decoderFactory = LKRTCDefaultVideoDecoderFactory()
        factory = LKRTCPeerConnectionFactory(
            encoderFactory: defaultEncoderFactory,
            decoderFactory: decoderFactory
        )
        videoSource = factory.videoSource(forScreenCast: true)
        videoTrack = factory.videoTrack(with: videoSource, trackId: "simulator-video")
        videoTrack.isEnabled = true
        capturer = LKRTCVideoCapturer(delegate: videoSource)
        streamLog(
            "[webrtc] Publisher ready (default codec factory + screen-cast video source) " +
            "h264=\(h264SupportDescription()) h264FrameMode=\(h264FrameModeDescription()) " +
            "senderCodecs=\(senderCodecSummary())"
        )
    }

    func updateSettings(maxFps: Int, targetBitrate: Int, maxDimension: Int) async {
        await withCheckedContinuation { continuation in
            queue.async {
                let normalizedMaxFps = max(1, min(120, maxFps))
                self.frameLock.lock()
                self.maxFps = normalizedMaxFps
                self.frameIntervalNs = UInt64(1_000_000_000 / normalizedMaxFps)
                self.frameLock.unlock()
                self.targetBitrate = max(100_000, targetBitrate)
                self.maxDimension = max(0, maxDimension)
                if self.lastOutputWidth > 0, self.lastOutputHeight > 0 {
                    self.videoSource.adaptOutputFormat(
                        toWidth: Int32(self.lastOutputWidth),
                        height: Int32(self.lastOutputHeight),
                        fps: Int32(self.maxFps)
                    )
                }
                for session in self.sessions.values {
                    self.applyBitrateSettings(to: session)
                }
                streamLog(
                    "[webrtc] Settings updated fps=\(self.maxFps) bitrate=\(self.targetBitrate) " +
                    "maxDimension=\(self.maxDimension)"
                )
                continuation.resume()
            }
        }
    }

    func handleOffer(_ request: WebRTCOfferPayload) async throws -> WebRTCAnswerPayload {
        try await withCheckedThrowingContinuation { continuation in
            let completion = WebRTCSignalingCompletion { result in
                continuation.resume(with: result)
            }
            queue.async {
                guard !self.cancelledSessionIds.contains(request.sessionId) else {
                    _ = completion.resume(with: .failure(self.makeError("WebRTC session was cancelled")))
                    return
                }
                guard self.pendingOffer == nil else {
                    _ = completion.resume(with: .failure(self.makeError("WebRTC signaling already in progress")))
                    return
                }
                guard self.sessions[request.sessionId] == nil else {
                    _ = completion.resume(with: .failure(self.makeError("WebRTC session ID already active")))
                    return
                }
                self.createAnswer(request) { result in
                    _ = completion.resume(with: result)
                }
            }
            queue.asyncAfter(deadline: .now().advanced(by: .milliseconds(Self.signalingTimeoutMs))) {
                guard completion.resume(with: .failure(self.makeError("WebRTC signaling timed out"))) else {
                    return
                }
                self.closePendingOffer(sessionId: request.sessionId)
            }
        }
    }

    func closeSession(_ sessionId: String) async {
        await withCheckedContinuation { continuation in
            queue.async {
                self.rememberCancelledSession(sessionId)
                if let pending = self.pendingOffer, pending.session.id == sessionId {
                    self.pendingOffer = nil
                    pending.session.close()
                    pending.completion(.failure(self.makeError("WebRTC session was cancelled")))
                }
                if let session = self.sessions.removeValue(forKey: sessionId) {
                    session.close()
                    self.refreshFrameAcceptance()
                    streamLog("[webrtc] Session closed; activePeers=\(self.sessions.values.filter(\.isConnected).count)")
                }
                continuation.resume()
            }
        }
    }

    func sendFrame(_ pixelBuffer: CVPixelBuffer, timestamp: CMTime) {
        let frame = PendingWebRTCFrame(pixelBuffer: pixelBuffer, timestamp: timestamp)
        var scheduleDelayNs: UInt64?
        let nowNs = DispatchTime.now().uptimeNanoseconds
        let schedulingToleranceNs: UInt64 = 1_000_000
        frameLock.lock()
        let frameIntervalNs = self.frameIntervalNs
        guard acceptsFrames else {
            frameLock.unlock()
            return
        }
        // Always retain the newest frame. Dropping every frame inside the rate
        // limit can lose the final state of a short animation until the 5fps
        // idle floor emits it again.
        pendingFrame = frame
        if !framePumpScheduled {
            framePumpScheduled = true
            let earliestSendNs = lastSentFrameAtNs &+ frameIntervalNs
            scheduleDelayNs = lastSentFrameAtNs == 0 || nowNs &+ schedulingToleranceNs >= earliestSendNs
                ? 0
                : earliestSendNs - nowNs
        }
        frameLock.unlock()
        if let scheduleDelayNs {
            scheduleFramePump(afterNs: scheduleDelayNs)
        }
    }

    private func nextFrameTimestampNs(_ timestamp: CMTime) -> Int64 {
        let captureTime = CMTimeGetSeconds(timestamp) * 1_000_000_000
        let proposedTimestamp = captureTime.isFinite && captureTime > 0
            ? Int64(captureTime)
            : Int64(DispatchTime.now().uptimeNanoseconds)
        let timestampNs = max(proposedTimestamp, lastFrameTimestampNs + 1)
        lastFrameTimestampNs = timestampNs
        return timestampNs
    }

    private func sendFrameOnQueue(_ pixelBuffer: CVPixelBuffer, timestamp: CMTime) {
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        if width != lastOutputWidth || height != lastOutputHeight {
            lastOutputWidth = width
            lastOutputHeight = height
            videoSource.adaptOutputFormat(
                toWidth: Int32(width),
                height: Int32(height),
                fps: Int32(maxFps)
            )
            for session in sessions.values {
                applyBitrateSettings(to: session)
            }
            streamLog("[webrtc] Video source output format: \(width)x\(height) @ \(maxFps)fps")
        }
        let pixelFormat = CVPixelBufferGetPixelFormatType(pixelBuffer)
        if lastInputPixelFormat != pixelFormat {
            lastInputPixelFormat = pixelFormat
            let supported = LKRTCCVPixelBuffer.supportedPixelFormats()
                .contains(NSNumber(value: UInt32(pixelFormat)))
            useNativePixelBufferFrames = supported
            let frameMode = supported ? "native CVPixelBuffer" : "I420 fallback"
            streamLog("[webrtc] Input pixel format: \(pixelFormat) cvPixelBufferSupported=\(supported); forwarding as \(frameMode)")
        }
        let timeNs = nextFrameTimestampNs(timestamp)
        let sourceFrame = LKRTCVideoFrame(
            buffer: LKRTCCVPixelBuffer(pixelBuffer: pixelBuffer),
            rotation: ._0,
            timeStampNs: timeNs
        )
        var convertDurationMs = 0.0
        var usedFrame = sourceFrame
        var usedNativeFrame = useNativePixelBufferFrames ?? false
        var forwardedPixelFormat = pixelFormat
        var frameMode = usedNativeFrame ? "native" : "i420"

        let activeCodecNames = Set(
            sessions.values.lazy.filter(\.isConnected).map(\.codecName)
        )
        let codecSummary = activeCodecNames.sorted().joined(separator: ",")
        if activeCodecNames.contains("H264") {
            switch h264FrameMode() {
            case .bgra:
                usedNativeFrame = useNativePixelBufferFrames ?? false
                if usedNativeFrame {
                    frameMode = "bgra-h264"
                } else {
                    let convertStartNs = DispatchTime.now().uptimeNanoseconds
                    usedFrame = sourceFrame.newI420()
                    convertDurationMs = Double(DispatchTime.now().uptimeNanoseconds - convertStartNs) / 1_000_000.0
                    frameMode = "i420-fallback"
                }
            case .i420:
                let convertStartNs = DispatchTime.now().uptimeNanoseconds
                usedFrame = sourceFrame.newI420()
                convertDurationMs = Double(DispatchTime.now().uptimeNanoseconds - convertStartNs) / 1_000_000.0
                usedNativeFrame = false
                frameMode = "i420-h264"
            case .nv12:
                if Self.isBiPlanar420(pixelFormat) {
                    usedNativeFrame = true
                    frameMode = "nv12-input"
                } else if let converted = h264PixelBufferConverter.convert(pixelBuffer) {
                    convertDurationMs = h264PixelBufferConverter.lastDurationMs
                    forwardedPixelFormat = CVPixelBufferGetPixelFormatType(converted)
                    usedFrame = LKRTCVideoFrame(
                        buffer: LKRTCCVPixelBuffer(pixelBuffer: converted),
                        rotation: ._0,
                        timeStampNs: timeNs
                    )
                    usedNativeFrame = true
                    frameMode = "nv12"
                } else {
                    let convertStartNs = DispatchTime.now().uptimeNanoseconds
                    usedFrame = sourceFrame.newI420()
                    convertDurationMs = Double(DispatchTime.now().uptimeNanoseconds - convertStartNs) / 1_000_000.0
                    usedNativeFrame = false
                    frameMode = "i420-fallback"
                }
            }
        } else if !usedNativeFrame {
            let convertStartNs = DispatchTime.now().uptimeNanoseconds
            usedFrame = sourceFrame.newI420()
            convertDurationMs = Double(DispatchTime.now().uptimeNanoseconds - convertStartNs) / 1_000_000.0
            frameMode = "i420-fallback"
        }

        videoSource.capturer(capturer, didCapture: usedFrame)
        sentFrameCount += 1
        if shouldLogFrame(sentFrameCount) {
            streamLog(
                "[webrtc] Sent video frame #\(sentFrameCount) codecs=\(codecSummary) " +
                "size=\(width)x\(height) timestampNs=\(timeNs) frameMode=\(frameMode) " +
                "inputFormat=\(pixelFormatDescription(pixelFormat)) " +
                "forwardedFormat=\(pixelFormatDescription(forwardedPixelFormat)) " +
                "native=\(usedNativeFrame) conversionMs=\(String(format: "%.2f", convertDurationMs))"
            )
        }
    }

    func stop() {
        queue.sync {
            if let pending = pendingOffer {
                pendingOffer = nil
                pending.session.close()
                pending.completion(.failure(makeError("WebRTC publisher stopped")))
            }
            for session in sessions.values {
                session.close()
            }
            sessions.removeAll()
            setFrameAcceptance(false)
        }
    }

    private func drainFramePump() {
        let nowNs = DispatchTime.now().uptimeNanoseconds
        let schedulingToleranceNs: UInt64 = 1_000_000
        frameLock.lock()
        let frameIntervalNs = self.frameIntervalNs
        guard acceptsFrames else {
            pendingFrame = nil
            framePumpScheduled = false
            frameLock.unlock()
            return
        }
        guard let frame = pendingFrame else {
            framePumpScheduled = false
            frameLock.unlock()
            return
        }
        let earliestSendNs = lastSentFrameAtNs &+ frameIntervalNs
        if lastSentFrameAtNs > 0, nowNs &+ schedulingToleranceNs < earliestSendNs {
            let delayNs = earliestSendNs - nowNs
            frameLock.unlock()
            scheduleFramePump(afterNs: delayNs)
            return
        }
        pendingFrame = nil
        lastSentFrameAtNs = nowNs
        frameLock.unlock()

        if sessions.values.contains(where: \.isConnected) {
            sendFrameOnQueue(frame.pixelBuffer, timestamp: frame.timestamp)
        }

        frameLock.lock()
        if acceptsFrames && pendingFrame != nil {
            frameLock.unlock()
            scheduleFramePump(afterNs: frameIntervalNs)
        } else {
            framePumpScheduled = false
            frameLock.unlock()
        }
    }

    private func scheduleFramePump(afterNs delayNs: UInt64) {
        if delayNs == 0 {
            queue.async { self.drainFramePump() }
            return
        }
        queue.asyncAfter(deadline: .now() + .nanoseconds(Int(delayNs))) {
            self.drainFramePump()
        }
    }

    private func setFrameAcceptance(_ active: Bool) {
        frameLock.lock()
        if acceptsFrames != active {
            acceptsFrames = active
            pendingFrame = nil
            lastSentFrameAtNs = 0
        }
        frameLock.unlock()
    }

    private func refreshFrameAcceptance() {
        setFrameAcceptance(sessions.values.contains(where: \.isConnected))
    }

    private func createAnswer(
        _ request: WebRTCOfferPayload,
        completion: @escaping (Result<WebRTCAnswerPayload, Error>) -> Void
    ) {
        let config = LKRTCConfiguration()
        config.sdpSemantics = .unifiedPlan
        config.bundlePolicy = .maxBundle
        config.rtcpMuxPolicy = .require
        config.candidateNetworkPolicy = .all
        config.continualGatheringPolicy = .gatherOnce
        config.iceServers = iceServers(from: request.iceServers)
        config.iceTransportPolicy = .all
        streamLog("[webrtc] ICE transport policy: all (TURN as fallback)")
        streamLog("[webrtc] ICE servers: \(iceServerSummary(request.iceServers))")

        let constraints = LKRTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )
        let delegate = WebRTCSessionDelegate(
            onConnected: { [weak self] peerConnection in
                self?.activateSession(peerConnection)
            },
            onClosed: { [weak self] peerConnection in
                self?.clearSession(peerConnection)
            }
        )
        guard let peerConnection = factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: delegate
        ) else {
            failOffer(nil, makeError("Failed to create peer connection"), completion)
            return
        }

        let session = WebRTCSession(id: request.sessionId, peerConnection: peerConnection, delegate: delegate)
        delegate.peerConnection = peerConnection
        pendingOffer = PendingWebRTCOffer(session: session, completion: completion)

        let remoteDescription = LKRTCSessionDescription(type: .offer, sdp: request.sdp)
        peerConnection.setRemoteDescription(remoteDescription) { error in
            self.queue.async {
                if let error {
                    self.failOffer(session, error, completion)
                    return
                }
                guard self.isPending(session) else {
                    self.failOffer(session, self.makeError("WebRTC offer was superseded"), completion)
                    return
                }
                self.attachVideoTrack(to: peerConnection, session: session, codec: request.codec)
                peerConnection.answer(for: constraints) { answer, error in
                    self.queue.async {
                        if let error {
                            self.failOffer(session, error, completion)
                            return
                        }
                        guard self.isPending(session) else {
                            self.failOffer(session, self.makeError("WebRTC offer was superseded"), completion)
                            return
                        }
                        guard let answer else {
                            self.failOffer(session, self.makeError("answer creation returned nil"), completion)
                            return
                        }
                        peerConnection.setLocalDescription(answer) { error in
                            self.queue.async {
                                if let error {
                                    self.failOffer(session, error, completion)
                                    return
                                }
                                guard self.isPending(session) else {
                                    self.failOffer(session, self.makeError("WebRTC offer was superseded"), completion)
                                    return
                                }
                                session.waitForIceGathering { completed in
                                    self.queue.async {
                                        guard self.isPending(session) else {
                                            self.failOffer(session, self.makeError("WebRTC offer was superseded"), completion)
                                            return
                                        }
                                        let local = peerConnection.localDescription ?? answer
                                        let gatheredCandidates = delegate.generatedCandidatesSnapshot()
                                        let finalSdp = self.sdpWithGatheredCandidates(
                                            local.sdp,
                                            candidates: gatheredCandidates
                                        )
                                        var candidateCounts = self.iceCandidateCounts(in: finalSdp)
                                        if candidateCounts.isEmpty {
                                            candidateCounts = self.iceCandidateCounts(in: gatheredCandidates)
                                        }
                                        if !completed {
                                            streamLog("[webrtc] ICE gathering timed out; proceeding with candidates gathered so far: \(candidateCounts)")
                                        } else if self.hasCredentialedTurnServer(request.iceServers), candidateCounts["relay", default: 0] == 0 {
                                            streamLog("[webrtc] WARNING: no relay ICE candidates gathered for credentialed TURN offer; counts=\(candidateCounts)")
                                        } else {
                                            streamLog("[webrtc] ICE candidates gathered: \(candidateCounts)")
                                        }
                                        self.completeOffer(
                                            session,
                                            answer: WebRTCAnswerPayload(
                                                type: LKRTCSessionDescription.string(for: local.type),
                                                sdp: finalSdp
                                            ),
                                            completion
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func failOffer(
        _ offerSession: WebRTCSession?,
        _ error: Error,
        _ completion: @escaping (Result<WebRTCAnswerPayload, Error>) -> Void
    ) {
        if let offerSession {
            offerSession.close()
            if isPending(offerSession) {
                pendingOffer = nil
            }
        }
        completion(.failure(error))
    }

    private func completeOffer(
        _ offerSession: WebRTCSession,
        answer: WebRTCAnswerPayload,
        _ completion: @escaping (Result<WebRTCAnswerPayload, Error>) -> Void
    ) {
        guard isPending(offerSession) else {
            failOffer(offerSession, makeError("WebRTC offer was superseded"), completion)
            return
        }
        pendingOffer = nil
        sessions[offerSession.id] = offerSession
        queue.asyncAfter(deadline: .now().advanced(by: .milliseconds(Self.connectionTimeoutMs))) {
            guard self.sessions[offerSession.id] === offerSession else { return }
            guard !offerSession.isConnected else { return }
            streamLog("[webrtc] Peer did not connect before deadline; closing orphaned session")
            offerSession.close()
            self.sessions.removeValue(forKey: offerSession.id)
            self.refreshFrameAcceptance()
        }
        completion(.success(answer))
    }

    private func activateSession(_ peerConnection: LKRTCPeerConnection) {
        queue.async {
            guard let session = self.sessions.values.first(where: { $0.peerConnection === peerConnection }) else {
                return
            }
            guard !session.isConnected else { return }
            session.isConnected = true
            self.refreshFrameAcceptance()
            streamLog("[webrtc] Peer connected; activePeers=\(self.sessions.values.filter(\.isConnected).count)")
        }
    }

    private func isPending(_ offerSession: WebRTCSession) -> Bool {
        pendingOffer?.session === offerSession
    }

    private func closePendingOffer(sessionId: String) {
        guard let pending = pendingOffer, pending.session.id == sessionId else { return }
        pendingOffer = nil
        pending.session.close()
    }

    private func rememberCancelledSession(_ sessionId: String) {
        guard cancelledSessionIds.insert(sessionId).inserted else { return }
        cancelledSessionIdOrder.append(sessionId)
        if cancelledSessionIdOrder.count > 64 {
            cancelledSessionIds.remove(cancelledSessionIdOrder.removeFirst())
        }
    }

    private func attachVideoTrack(to peerConnection: LKRTCPeerConnection, session: WebRTCSession, codec: String?) {
        let transceiver = peerConnection.transceivers.first { $0.mediaType == .video }
            ?? createFallbackVideoTransceiver(on: peerConnection)
        guard let transceiver else {
            _ = peerConnection.add(videoTrack, streamIds: ["stream0"])
            streamLog("[webrtc] Could not find or create video transceiver; fell back to addTrack")
            return
        }

        transceiver.sender.track = videoTrack
        transceiver.sender.streamIds = ["stream0"]
        var directionError: NSError?
        transceiver.setDirection(.sendOnly, error: &directionError)
        if let directionError {
            streamLog("[webrtc] Failed to set video transceiver direction: \(directionError.localizedDescription)")
        }
        session.codecName = applyVideoCodecPreference(codec, to: transceiver)
        session.videoSender = transceiver.sender
        applyBitrateSettings(to: session)
    }

    private func createFallbackVideoTransceiver(on peerConnection: LKRTCPeerConnection) -> LKRTCRtpTransceiver? {
        let initOptions = LKRTCRtpTransceiverInit()
        initOptions.direction = .sendOnly
        initOptions.streamIds = ["stream0"]
        return peerConnection.addTransceiver(with: videoTrack, init: initOptions)
    }

    private func iceServers(from payload: [WebRTCIceServerPayload]?) -> [LKRTCIceServer] {
        let servers = payload ?? defaultWebRTCIceServers
        return servers.flatMap { server in
            server.urls.map { url in
                LKRTCIceServer(
                    urlStrings: [url],
                    username: server.username,
                    credential: server.credential
                )
            }
        }
    }

    private func hasCredentialedTurnServer(_ payload: [WebRTCIceServerPayload]?) -> Bool {
        (payload ?? []).contains { server in
            guard
                let username = server.username, !username.isEmpty,
                let credential = server.credential, !credential.isEmpty
            else {
                return false
            }
            return server.urls.contains { $0.lowercased().hasPrefix("turn:") || $0.lowercased().hasPrefix("turns:") }
        }
    }

    private func iceServerSummary(_ payload: [WebRTCIceServerPayload]?) -> String {
        let servers = payload ?? defaultWebRTCIceServers
        let stunUrls = servers.flatMap { server in
            server.urls.filter { $0.lowercased().hasPrefix("stun:") }
        }.count
        let turnUrls = servers.flatMap { server in
            server.urls.filter { $0.lowercased().hasPrefix("turn:") || $0.lowercased().hasPrefix("turns:") }
        }.count
        let credentialedTurnServers = servers.filter { server in
            let hasCredentials = !(server.username ?? "").isEmpty && !(server.credential ?? "").isEmpty
            return hasCredentials && server.urls.contains {
                $0.lowercased().hasPrefix("turn:") || $0.lowercased().hasPrefix("turns:")
            }
        }.count
        return "servers=\(servers.count) stunUrls=\(stunUrls) turnUrls=\(turnUrls) credentialedTurnServers=\(credentialedTurnServers)"
    }

    private func iceCandidateCounts(in sdp: String) -> [String: Int] {
        var counts: [String: Int] = [:]
        for line in sdp.split(separator: "\n") {
            let trimmedLine = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmedLine.hasPrefix("a=candidate:") else { continue }
            let parts = trimmedLine.split(whereSeparator: { $0 == " " || $0 == "\t" })
            if let typeIndex = parts.firstIndex(of: "typ"), parts.indices.contains(parts.index(after: typeIndex)) {
                counts[String(parts[parts.index(after: typeIndex)]), default: 0] += 1
            } else {
                counts["unknown", default: 0] += 1
            }
        }
        return counts
    }

    private func iceCandidateCounts(in candidates: [LKRTCIceCandidate]) -> [String: Int] {
        var counts: [String: Int] = [:]
        for candidate in candidates {
            let candidateLine = candidate.sdp.hasPrefix("a=")
                ? candidate.sdp
                : "a=\(candidate.sdp)"
            let parts = candidateLine.split(whereSeparator: { $0 == " " || $0 == "\t" })
            if let typeIndex = parts.firstIndex(of: "typ"), parts.indices.contains(parts.index(after: typeIndex)) {
                counts[String(parts[parts.index(after: typeIndex)]), default: 0] += 1
            } else {
                counts["unknown", default: 0] += 1
            }
        }
        return counts
    }

    private func sdpWithGatheredCandidates(_ sdp: String, candidates: [LKRTCIceCandidate]) -> String {
        let newline = sdp.contains("\r\n") ? "\r\n" : "\n"
        var lines = sdp.components(separatedBy: newline)
        let hadTrailingNewline = lines.last == ""
        if hadTrailingNewline {
            lines.removeLast()
        }
        var existingCandidateLines: [Int: Set<String>] = [:]
        var sectionsNeedingEndMarker = Set<Int>()
        var currentSection = -1
        for line in lines {
            if line.hasPrefix("m=") {
                currentSection += 1
            } else if line.hasPrefix("a=candidate:"), currentSection >= 0 {
                existingCandidateLines[currentSection, default: []].insert(line)
                sectionsNeedingEndMarker.insert(currentSection)
            }
        }
        var sectionCandidates: [Int: [String]] = [:]

        for candidate in candidates {
            let candidateLine = candidate.sdp.hasPrefix("a=")
                ? candidate.sdp
                : "a=\(candidate.sdp)"
            guard let sectionIndex = mediaSectionIndex(
                in: lines,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex
            ) else {
                streamLog("[webrtc] Ignoring ICE candidate without a valid media section")
                continue
            }
            sectionsNeedingEndMarker.insert(sectionIndex)
            guard existingCandidateLines[sectionIndex, default: []].insert(candidateLine).inserted else {
                continue
            }
            sectionCandidates[sectionIndex, default: []].append(candidateLine)
        }

        for sectionIndex in sectionsNeedingEndMarker.sorted(by: >) {
            let sectionRange = mediaSectionRange(in: lines, sectionIndex: sectionIndex)
            let insertIndex = endOfCandidatesIndex(in: lines, range: sectionRange) ?? sectionRange.upperBound
            var insertedLines = sectionCandidates[sectionIndex] ?? []
            if endOfCandidatesIndex(in: lines, range: sectionRange) == nil {
                insertedLines.append("a=end-of-candidates")
            }
            guard !insertedLines.isEmpty else { continue }
            lines.insert(contentsOf: insertedLines, at: insertIndex)
        }

        let body = lines.joined(separator: newline)
        return hadTrailingNewline ? "\(body)\(newline)" : body
    }

    private func mediaSectionIndex(
        in lines: [String],
        sdpMid: String?,
        sdpMLineIndex: Int32
    ) -> Int? {
        let sectionCount = lines.reduce(into: 0) { count, line in
            if line.hasPrefix("m=") { count += 1 }
        }
        if let sdpMid {
            var currentSection = -1
            for line in lines {
                if line.hasPrefix("m=") {
                    currentSection += 1
                } else if line == "a=mid:\(sdpMid)", currentSection >= 0 {
                    return currentSection
                }
            }
        }
        let candidateIndex = Int(sdpMLineIndex)
        if candidateIndex >= 0, candidateIndex < sectionCount {
            return candidateIndex
        }
        return sectionCount == 1 ? 0 : nil
    }

    private func mediaSectionRange(in lines: [String], sectionIndex: Int) -> Range<Int> {
        var currentSection = -1
        var start = lines.count
        for (index, line) in lines.enumerated() where line.hasPrefix("m=") {
            currentSection += 1
            if currentSection == sectionIndex {
                start = index
            } else if currentSection > sectionIndex, start < lines.count {
                return start..<index
            }
        }
        if start < lines.count {
            return start..<lines.count
        }
        return lines.count..<lines.count
    }

    private func endOfCandidatesIndex(in lines: [String], range: Range<Int>) -> Int? {
        for index in range {
            if lines[index] == "a=end-of-candidates" {
                return index
            }
        }
        return nil
    }

    private func applyVideoCodecPreference(_ codec: String?, to transceiver: LKRTCRtpTransceiver) -> String {
        let requestedName = Self.preferredVideoCodecName(codec)
        var preferredName = requestedName
        if requestedName == "H264", !h264WebRTCSupport.allowed {
            preferredName = "VP8"
            streamLog(
                "[webrtc] H.264 requested but disabled (\(h264WebRTCSupport.reason ?? "unsupported runtime")); " +
                "preferring VP8"
            )
        }
        let capabilities = factory.rtpSenderCapabilities(forKind: "video")
        // VP8/VP9 do not need VideoToolbox. Avoid running the synchronous H.264
        // capability probe on VMs unless H.264 was actually requested.
        let usableCodecs = requestedName == "H264" && !h264WebRTCSupport.allowed
            ? capabilities.codecs.filter { !Self.codecCapability($0, matches: "H264") }
            : capabilities.codecs
        let preferredCodecs = usableCodecs.filter {
            $0.name.caseInsensitiveCompare(preferredName) == .orderedSame ||
                $0.mimeType.caseInsensitiveCompare("video/\(preferredName)") == .orderedSame
        }
        guard !preferredCodecs.isEmpty else {
            streamLog("[webrtc] No sender codec capability found for \(preferredName); using default order")
            return preferredName
        }
        let remainingCodecs = usableCodecs.filter { capability in
            !preferredCodecs.contains { $0 === capability }
        }
        let orderedCodecs = preferredCodecs + remainingCodecs
        do {
            try transceiver.setCodecPreferences(orderedCodecs, error: ())
        } catch {
            streamLog("[webrtc] Failed to set codec preferences: \(error.localizedDescription)")
        }
        streamLog("[webrtc] Preferred video codec: \(preferredName)")
        return preferredName
    }

    private func applyBitrateSettings(to session: WebRTCSession) {
        guard let sender = session.videoSender else { return }
        let parameters = sender.parameters
        let encodings = parameters.encodings.isEmpty
            ? [LKRTCRtpEncodingParameters()]
            : parameters.encodings
        let maxBitrate = NSNumber(value: targetBitrate)
        let minBitrate = NSNumber(value: max(100_000, targetBitrate / 5))
        let fps = NSNumber(value: maxFps)
        let sourceMaxDimension = max(lastOutputWidth, lastOutputHeight)
        let scaleResolutionDownBy = maxDimension > 0 && sourceMaxDimension > maxDimension
            ? Double(sourceMaxDimension) / Double(maxDimension)
            : 1.0
        for encoding in encodings {
            encoding.isActive = true
            encoding.maxBitrateBps = maxBitrate
            encoding.minBitrateBps = minBitrate
            encoding.maxFramerate = fps
            encoding.scaleResolutionDownBy = NSNumber(value: scaleResolutionDownBy)
        }
        parameters.encodings = encodings
        sender.parameters = parameters
        let bweUpdated = session.peerConnection.setBweMinBitrateBps(
            minBitrate,
            currentBitrateBps: maxBitrate,
            maxBitrateBps: maxBitrate
        )
        streamLog(
            "[webrtc] Sender parameters fps=\(maxFps) minBitrate=\(minBitrate) " +
            "maxBitrate=\(maxBitrate) maxDimension=\(maxDimension) " +
            "scaleDown=\(String(format: "%.3f", scaleResolutionDownBy)) bweUpdated=\(bweUpdated)"
        )
    }

    private func clearSession(_ peerConnection: LKRTCPeerConnection?) {
        queue.async {
            if let pending = self.pendingOffer, pending.session.peerConnection === peerConnection {
                self.pendingOffer = nil
                pending.session.close()
                pending.completion(.failure(self.makeError("WebRTC peer connection closed during signaling")))
                return
            }
            guard let entry = self.sessions.first(where: { $0.value.peerConnection === peerConnection }) else {
                return
            }
            let session = entry.value
            session.close()
            self.sessions.removeValue(forKey: entry.key)
            self.refreshFrameAcceptance()
            streamLog("[webrtc] Peer connection closed; activePeers=\(self.sessions.values.filter(\.isConnected).count)")
        }
    }

    private func senderCodecSummary() -> String {
        let names = factory.rtpSenderCapabilities(forKind: "video").codecs.map { capability in
            capability.mimeType.isEmpty ? capability.name : capability.mimeType
        }
        return names.joined(separator: ",")
    }

    private func makeError(_ message: String) -> Error {
        NSError(domain: "serve-sim.webrtc", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private func shouldLogFrame(_ count: Int64) -> Bool {
        count <= 5 || count % 120 == 0
    }

    private static func preferredVideoCodecName(_ codec: String?) -> String {
        switch codec?.lowercased() {
        case "vp8":
            return "VP8"
        case "vp9":
            return "VP9"
        default:
            return "H264"
        }
    }

    private static func codecCapability(_ capability: LKRTCRtpCodecCapability, matches name: String) -> Bool {
        capability.name.caseInsensitiveCompare(name) == .orderedSame ||
            capability.mimeType.caseInsensitiveCompare("video/\(name)") == .orderedSame
    }

    private static func isBiPlanar420(_ pixelFormat: OSType) -> Bool {
        pixelFormat == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange ||
            pixelFormat == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
    }

    private func h264FrameMode() -> H264WebRTCFrameMode {
        if let h264FrameModeOverride {
            return h264FrameModeOverride
        }
        return h264WebRTCSupport.usesHardware == false ? .bgra : .nv12
    }

    private func h264FrameModeDescription() -> String {
        let source = h264FrameModeOverride == nil ? "auto" : "env"
        return "\(h264FrameMode().rawValue)(\(source))"
    }

    private func h264SupportDescription() -> String {
        h264WebRTCSupport.allowed
            ? "enabled(\(h264WebRTCSupport.probeSummary))"
            : "disabled(\(h264WebRTCSupport.reason ?? "unsupported runtime"))"
    }

    private static func detectH264WebRTCSupport() -> WebRTCH264Support {
        let environment = ProcessInfo.processInfo.environment
        if envFlagEnabled(environment["SERVE_SIM_DISABLE_WEBRTC_H264"]) {
            return WebRTCH264Support(
                allowed: false,
                reason: "disabled by SERVE_SIM_DISABLE_WEBRTC_H264",
                encoderID: nil,
                usesHardware: nil,
                probeSummary: "disabled by environment"
            )
        }
        if envFlagEnabled(environment["SERVE_SIM_ALLOW_VM_H264_WEBRTC"]) ||
            envFlagEnabled(environment["SERVE_SIM_FORCE_WEBRTC_H264"]) {
            return WebRTCH264Support(
                allowed: true,
                reason: nil,
                encoderID: nil,
                usesHardware: nil,
                probeSummary: "forced by environment"
            )
        }
        let probe = probeVideoToolboxH264Encoder()
        if probe.encodedFrame {
            return WebRTCH264Support(
                allowed: true,
                reason: nil,
                encoderID: probe.encoderID,
                usesHardware: probe.usesHardware,
                probeSummary: probe.summary
            )
        }
        let modelPrefix = sysctlString("hw.model").map { " on \($0)" } ?? ""
        return WebRTCH264Support(
            allowed: false,
            reason: "VideoToolbox H.264 probe failed\(modelPrefix): \(probe.summary)",
            encoderID: probe.encoderID,
            usesHardware: probe.usesHardware,
            probeSummary: probe.summary
        )
    }

    private static func probeVideoToolboxH264Encoder() -> H264VideoToolboxProbe {
        let width: Int32 = 64
        let height: Int32 = 64
        let attrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
            kCVPixelBufferWidthKey as String: Int(width),
            kCVPixelBufferHeightKey as String: Int(height),
            kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        ]
        var session: VTCompressionSession?
        let createStatus = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: width,
            height: height,
            codecType: kCMVideoCodecType_H264,
            encoderSpecification: nil,
            imageBufferAttributes: attrs as CFDictionary,
            compressedDataAllocator: nil,
            outputCallback: nil,
            refcon: nil,
            compressionSessionOut: &session
        )
        guard createStatus == noErr, let session else {
            return H264VideoToolboxProbe(
                encodedFrame: false,
                encoderID: nil,
                usesHardware: nil,
                summary: "createStatus=\(createStatus)"
            )
        }
        defer { VTCompressionSessionInvalidate(session) }

        _ = VTSessionSetProperty(session, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)
        _ = VTSessionSetProperty(session, key: kVTCompressionPropertyKey_ProfileLevel, value: kVTProfileLevel_H264_Baseline_AutoLevel)
        _ = VTSessionSetProperty(session, key: kVTCompressionPropertyKey_AllowFrameReordering, value: kCFBooleanFalse)
        _ = VTSessionSetProperty(session, key: kVTCompressionPropertyKey_ExpectedFrameRate, value: NSNumber(value: 30))

        let prepareStatus = VTCompressionSessionPrepareToEncodeFrames(session)
        let encoderID = vtSessionStringProperty(session, key: kVTCompressionPropertyKey_EncoderID)
        let usesHardware = inferredHardwareAcceleration(
            encoderID: encoderID,
            reported: vtSessionBoolProperty(session, key: kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder)
        )
        guard prepareStatus == noErr else {
            return H264VideoToolboxProbe(
                encodedFrame: false,
                encoderID: encoderID,
                usesHardware: usesHardware,
                summary: "encoderID=\(encoderID ?? "unknown") prepareStatus=\(prepareStatus)"
            )
        }

        guard let pixelBuffer = makeH264ProbePixelBuffer(width: Int(width), height: Int(height)) else {
            return H264VideoToolboxProbe(
                encodedFrame: false,
                encoderID: encoderID,
                usesHardware: usesHardware,
                summary: "encoderID=\(encoderID ?? "unknown") pixelBufferAllocationFailed"
            )
        }
        let semaphore = DispatchSemaphore(value: 0)
        var callbackStatus: OSStatus?
        var producedSample = false
        let encodeStatus = VTCompressionSessionEncodeFrame(
            session,
            imageBuffer: pixelBuffer,
            presentationTimeStamp: CMTime(value: 0, timescale: 30),
            duration: CMTime(value: 1, timescale: 30),
            frameProperties: nil,
            infoFlagsOut: nil
        ) { status, _, sampleBuffer in
            callbackStatus = status
            producedSample = status == noErr && sampleBuffer.map(CMSampleBufferDataIsReady) == true
            semaphore.signal()
        }
        let completeStatus = VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid)
        let completed = semaphore.wait(timeout: .now() + .milliseconds(750)) == .success
        let encodedFrame = encodeStatus == noErr &&
            completeStatus == noErr &&
            completed &&
            callbackStatus == noErr &&
            producedSample
        let hardwareSummary = usesHardware.map { "hardware=\($0)" } ?? "hardware=unknown"
        return H264VideoToolboxProbe(
            encodedFrame: encodedFrame,
            encoderID: encoderID,
            usesHardware: usesHardware,
            summary: "encoderID=\(encoderID ?? "unknown") \(hardwareSummary) " +
                "encodeStatus=\(encodeStatus) completeStatus=\(completeStatus) " +
                "callbackStatus=\(callbackStatus.map(String.init) ?? "missing") " +
                "sample=\(producedSample)"
        )
    }

    private static func makeH264ProbePixelBuffer(width: Int, height: Int) -> CVPixelBuffer? {
        let attrs: [String: Any] = [
            kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        ]
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
            attrs as CFDictionary,
            &pixelBuffer
        )
        guard status == kCVReturnSuccess, let pixelBuffer else { return nil }
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
        guard
            let yAddress = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0),
            let cbCrAddress = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1)
        else {
            return nil
        }
        let yStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
        let cbCrStride = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1)
        let yPointer = yAddress.assumingMemoryBound(to: UInt8.self)
        let cbCrPointer = cbCrAddress.assumingMemoryBound(to: UInt8.self)
        for row in 0..<height {
            let rowPointer = yPointer.advanced(by: row * yStride)
            for column in 0..<width {
                rowPointer[column] = UInt8((row + column) & 0xff)
            }
        }
        for row in 0..<(height / 2) {
            let rowPointer = cbCrPointer.advanced(by: row * cbCrStride)
            for column in stride(from: 0, to: width, by: 2) {
                rowPointer[column] = 128
                rowPointer[column + 1] = 128
            }
        }
        return pixelBuffer
    }

    private static func h264FrameModeOverride() -> H264WebRTCFrameMode? {
        guard let raw = ProcessInfo.processInfo.environment["SERVE_SIM_WEBRTC_H264_FRAME_MODE"]?.lowercased() else {
            return nil
        }
        switch raw {
        case "bgra", "native-bgra":
            return .bgra
        case "i420":
            return .i420
        case "nv12", "native", "cvpixelbuffer":
            return .nv12
        default:
            streamLog("[webrtc] Ignoring invalid SERVE_SIM_WEBRTC_H264_FRAME_MODE=\(raw); expected bgra, i420, or nv12")
            return nil
        }
    }

    private static func vtSessionStringProperty(_ session: VTCompressionSession, key: CFString) -> String? {
        var value: CFTypeRef?
        let status = withUnsafeMutablePointer(to: &value) { pointer in
            VTSessionCopyProperty(session, key: key, allocator: kCFAllocatorDefault, valueOut: pointer)
        }
        guard status == noErr, let value else { return nil }
        return String(describing: value)
    }

    private static func vtSessionBoolProperty(_ session: VTCompressionSession, key: CFString) -> Bool? {
        var value: CFTypeRef?
        let status = withUnsafeMutablePointer(to: &value) { pointer in
            VTSessionCopyProperty(session, key: key, allocator: kCFAllocatorDefault, valueOut: pointer)
        }
        guard status == noErr, let value else { return nil }
        if CFGetTypeID(value) == CFBooleanGetTypeID() {
            return CFBooleanGetValue((value as! CFBoolean))
        }
        return (value as? NSNumber)?.boolValue
    }

    private static func inferredHardwareAcceleration(encoderID: String?, reported: Bool?) -> Bool? {
        if let reported { return reported }
        guard let encoderID else { return nil }
        let normalized = encoderID.lowercased()
        if normalized.contains("paravirtualized") || normalized.contains(".ave.") {
            return true
        }
        if normalized.contains("com.apple.videotoolbox.videoencoder.h264") {
            return false
        }
        return nil
    }

    private static func envFlagEnabled(_ value: String?) -> Bool {
        switch value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "1", "true", "yes", "on":
            return true
        default:
            return false
        }
    }

    private static func sysctlString(_ name: String) -> String? {
        var size = 0
        guard sysctlbyname(name, nil, &size, nil, 0) == 0, size > 1 else { return nil }
        var buffer = [CChar](repeating: 0, count: size)
        guard sysctlbyname(name, &buffer, &size, nil, 0) == 0 else { return nil }
        return String(cString: buffer)
    }
}

private struct WebRTCH264Support {
    let allowed: Bool
    let reason: String?
    let encoderID: String?
    let usesHardware: Bool?
    let probeSummary: String
}

private struct H264VideoToolboxProbe {
    let encodedFrame: Bool
    let encoderID: String?
    let usesHardware: Bool?
    let summary: String
}

private enum H264WebRTCFrameMode: String {
    case bgra
    case i420
    case nv12
}

private final class H264WebRTCPixelBufferConverter {
    private var pool: CVPixelBufferPool?
    private var width = 0
    private var height = 0
    private var conversionInfo = vImage_ARGBToYpCbCr()
    private var conversionReady = false
    private(set) var lastDurationMs = 0.0

    init() {
        var pixelRange = vImage_YpCbCrPixelRange(
            Yp_bias: 0,
            CbCr_bias: 128,
            YpRangeMax: 255,
            CbCrRangeMax: 255,
            YpMax: 255,
            YpMin: 1,
            CbCrMax: 255,
            CbCrMin: 0
        )
        let status = vImageConvert_ARGBToYpCbCr_GenerateConversion(
            kvImage_ARGBToYpCbCrMatrix_ITU_R_709_2,
            &pixelRange,
            &conversionInfo,
            kvImageARGB8888,
            kvImage420Yp8_CbCr8,
            vImage_Flags(kvImageNoFlags)
        )
        conversionReady = status == kvImageNoError
        if !conversionReady {
            streamLog("[webrtc] H.264 NV12 conversion setup failed status=\(status)")
        }
    }

    func convert(_ source: CVPixelBuffer) -> CVPixelBuffer? {
        guard conversionReady else { return nil }
        let sourceFormat = CVPixelBufferGetPixelFormatType(source)
        guard sourceFormat == kCVPixelFormatType_32BGRA else {
            streamLog("[webrtc] H.264 NV12 conversion unsupported input format=\(pixelFormatDescription(sourceFormat))")
            return nil
        }
        let sourceWidth = CVPixelBufferGetWidth(source)
        let sourceHeight = CVPixelBufferGetHeight(source)
        guard sourceWidth > 1, sourceHeight > 1 else { return nil }
        guard let output = makePixelBuffer(width: sourceWidth, height: sourceHeight) else { return nil }

        CVPixelBufferLockBaseAddress(source, .readOnly)
        CVPixelBufferLockBaseAddress(output, [])
        defer {
            CVPixelBufferUnlockBaseAddress(output, [])
            CVPixelBufferUnlockBaseAddress(source, .readOnly)
        }
        guard
            let sourceAddress = CVPixelBufferGetBaseAddress(source),
            CVPixelBufferGetPlaneCount(output) >= 2,
            let yAddress = CVPixelBufferGetBaseAddressOfPlane(output, 0),
            let cbCrAddress = CVPixelBufferGetBaseAddressOfPlane(output, 1)
        else {
            return nil
        }

        var sourceBuffer = vImage_Buffer(
            data: sourceAddress,
            height: vImagePixelCount(sourceHeight),
            width: vImagePixelCount(sourceWidth),
            rowBytes: CVPixelBufferGetBytesPerRow(source)
        )
        var yBuffer = vImage_Buffer(
            data: yAddress,
            height: vImagePixelCount(CVPixelBufferGetHeightOfPlane(output, 0)),
            width: vImagePixelCount(CVPixelBufferGetWidthOfPlane(output, 0)),
            rowBytes: CVPixelBufferGetBytesPerRowOfPlane(output, 0)
        )
        var cbCrBuffer = vImage_Buffer(
            data: cbCrAddress,
            height: vImagePixelCount(CVPixelBufferGetHeightOfPlane(output, 1)),
            width: vImagePixelCount(CVPixelBufferGetWidthOfPlane(output, 1)),
            rowBytes: CVPixelBufferGetBytesPerRowOfPlane(output, 1)
        )
        var bgraPermuteMap: [UInt8] = [3, 2, 1, 0]
        let startNs = DispatchTime.now().uptimeNanoseconds
        let status = vImageConvert_ARGB8888To420Yp8_CbCr8(
            &sourceBuffer,
            &yBuffer,
            &cbCrBuffer,
            &conversionInfo,
            &bgraPermuteMap,
            vImage_Flags(kvImageNoFlags)
        )
        lastDurationMs = Double(DispatchTime.now().uptimeNanoseconds - startNs) / 1_000_000.0
        guard status == kvImageNoError else {
            streamLog("[webrtc] H.264 NV12 conversion failed status=\(status)")
            return nil
        }
        attachColorMetadata(to: output)
        return output
    }

    private func makePixelBuffer(width nextWidth: Int, height nextHeight: Int) -> CVPixelBuffer? {
        if pool == nil || width != nextWidth || height != nextHeight {
            width = nextWidth
            height = nextHeight
            let attrs: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
                kCVPixelBufferWidthKey as String: nextWidth,
                kCVPixelBufferHeightKey as String: nextHeight,
                kCVPixelBufferIOSurfacePropertiesKey as String: [:],
                kCVPixelBufferMetalCompatibilityKey as String: true,
            ]
            var newPool: CVPixelBufferPool?
            let status = CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, attrs as CFDictionary, &newPool)
            guard status == kCVReturnSuccess, let newPool else {
                streamLog("[webrtc] H.264 NV12 pixel buffer pool create failed status=\(status) size=\(nextWidth)x\(nextHeight)")
                pool = nil
                return nil
            }
            pool = newPool
            streamLog("[webrtc] H.264 NV12 pixel buffer pool ready size=\(nextWidth)x\(nextHeight)")
        }
        guard let pool else { return nil }
        var output: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &output)
        guard status == kCVReturnSuccess, let output else {
            streamLog("[webrtc] H.264 NV12 pixel buffer allocation failed status=\(status)")
            return nil
        }
        return output
    }

    private func attachColorMetadata(to pixelBuffer: CVPixelBuffer) {
        CVBufferSetAttachment(
            pixelBuffer,
            kCVImageBufferYCbCrMatrixKey,
            kCVImageBufferYCbCrMatrix_ITU_R_709_2,
            .shouldPropagate
        )
        CVBufferSetAttachment(
            pixelBuffer,
            kCVImageBufferColorPrimariesKey,
            kCVImageBufferColorPrimaries_ITU_R_709_2,
            .shouldPropagate
        )
        CVBufferSetAttachment(
            pixelBuffer,
            kCVImageBufferTransferFunctionKey,
            kCVImageBufferTransferFunction_sRGB,
            .shouldPropagate
        )
    }
}

private func pixelFormatDescription(_ pixelFormat: OSType) -> String {
    var value = pixelFormat.bigEndian
    let text = withUnsafeBytes(of: &value) { rawBuffer -> String in
        let bytes = rawBuffer.map { byte -> UInt8 in
            if byte >= 32 && byte <= 126 {
                return byte
            }
            return UInt8(ascii: ".")
        }
        return String(bytes: bytes, encoding: .ascii) ?? "\(pixelFormat)"
    }
    return "\(text)(\(pixelFormat))"
}

private final class WebRTCSession {
    let id: String
    let peerConnection: LKRTCPeerConnection
    let delegate: WebRTCSessionDelegate
    var videoSender: LKRTCRtpSender?
    var codecName = "H264"
    var isConnected = false
    private let iceGatheringTimeout: DispatchTimeInterval = .milliseconds(3_000)

    init(id: String, peerConnection: LKRTCPeerConnection, delegate: WebRTCSessionDelegate) {
        self.id = id
        self.peerConnection = peerConnection
        self.delegate = delegate
    }

    func waitForIceGathering(_ completion: @escaping (Bool) -> Void) {
        let lock = NSLock()
        var finished = false
        let finish = { [weak delegate] (completed: Bool) in
            lock.lock()
            if finished {
                lock.unlock()
                return
            }
            finished = true
            delegate?.setIceGatheringCompleteHandler(nil)
            lock.unlock()
            completion(completed)
        }
        delegate.setIceGatheringCompleteHandler {
            finish(true)
        }
        if peerConnection.iceGatheringState == .complete {
            finish(true)
            return
        }
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + iceGatheringTimeout) {
            finish(false)
        }
    }

    func close() {
        peerConnection.close()
    }
}

private final class WebRTCSessionDelegate: NSObject, LKRTCPeerConnectionDelegate {
    weak var peerConnection: LKRTCPeerConnection?
    private let onConnected: (LKRTCPeerConnection) -> Void
    private let onClosed: (LKRTCPeerConnection) -> Void
    private let iceGatheringCompleteHandlerLock = NSLock()
    private var iceGatheringCompleteHandler: (() -> Void)?
    private let candidatesLock = NSLock()
    private var generatedCandidates: [LKRTCIceCandidate] = []

    init(
        onConnected: @escaping (LKRTCPeerConnection) -> Void,
        onClosed: @escaping (LKRTCPeerConnection) -> Void
    ) {
        self.onConnected = onConnected
        self.onClosed = onClosed
    }

    func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange stateChanged: LKRTCSignalingState) {}
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didAdd stream: LKRTCMediaStream) {}
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didRemove stream: LKRTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: LKRTCPeerConnection) {}
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange newState: LKRTCIceConnectionState) {
        streamLog("[webrtc] ICE connection state: \(newState.rawValue)")
        if newState == .failed || newState == .closed {
            onClosed(peerConnection)
        } else if newState == .disconnected {
            closeIfStillDisconnected(peerConnection)
        }
    }
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange newState: LKRTCPeerConnectionState) {
        streamLog("[webrtc] Peer connection state: \(newState.rawValue)")
        if newState == .connected {
            onConnected(peerConnection)
        } else if newState == .failed || newState == .closed {
            onClosed(peerConnection)
        } else if newState == .disconnected {
            closeIfStillDisconnected(peerConnection)
        }
    }
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange newState: LKRTCIceGatheringState) {
        streamLog("[webrtc] ICE gathering state: \(newState.rawValue)")
        if newState == .complete {
            let completion = consumeIceGatheringCompleteHandler()
            completion?()
        }
    }
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didGenerate candidate: LKRTCIceCandidate) {
        candidatesLock.lock()
        generatedCandidates.append(candidate)
        candidatesLock.unlock()
        streamLog("[webrtc] ICE candidate gathered: \(candidateSummary(candidate))")
    }
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didRemove candidates: [LKRTCIceCandidate]) {}
    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didChangeLocalCandidate local: LKRTCIceCandidate,
        remoteCandidate remote: LKRTCIceCandidate,
        lastReceivedMs: Int32,
        changeReason: String
    ) {
        streamLog("[webrtc] ICE selected pair: local=\(candidateSummary(local)) remote=\(candidateSummary(remote)) reason=\(changeReason) lastReceivedMs=\(lastReceivedMs)")
    }
    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didFailToGatherIceCandidate event: LKRTCIceCandidateErrorEvent
    ) {
        streamLog("[webrtc] ICE candidate error: url=\(event.url) code=\(event.errorCode) text=\(event.errorText)")
    }
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didOpen dataChannel: LKRTCDataChannel) {
        streamLog("[webrtc] Closing unsupported data channel: \(dataChannel.label)")
        dataChannel.close()
    }

    func generatedCandidatesSnapshot() -> [LKRTCIceCandidate] {
        candidatesLock.lock()
        let candidates = generatedCandidates
        candidatesLock.unlock()
        return candidates
    }

    func setIceGatheringCompleteHandler(_ handler: (() -> Void)?) {
        iceGatheringCompleteHandlerLock.lock()
        iceGatheringCompleteHandler = handler
        iceGatheringCompleteHandlerLock.unlock()
    }

    private func consumeIceGatheringCompleteHandler() -> (() -> Void)? {
        iceGatheringCompleteHandlerLock.lock()
        let handler = iceGatheringCompleteHandler
        iceGatheringCompleteHandler = nil
        iceGatheringCompleteHandlerLock.unlock()
        return handler
    }

    private func candidateSummary(_ candidate: LKRTCIceCandidate) -> String {
        let parts = candidate.sdp.split(whereSeparator: { $0 == " " || $0 == "\t" })
        let protocolName = parts.indices.contains(2) ? String(parts[2]).lowercased() : "?"
        let address = parts.indices.contains(4) ? String(parts[4]) : "?"
        let port = parts.indices.contains(5) ? String(parts[5]) : "?"
        let type: String
        if let typeIndex = parts.firstIndex(of: "typ"), parts.indices.contains(parts.index(after: typeIndex)) {
            type = String(parts[parts.index(after: typeIndex)])
        } else {
            type = "unknown"
        }
        let server = candidate.serverUrl?.isEmpty == false ? " server=\(candidate.serverUrl!)" : ""
        return "type=\(type) protocol=\(protocolName) address=\(address) port=\(port)\(server)"
    }

    private func closeIfStillDisconnected(_ peerConnection: LKRTCPeerConnection) {
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 10) { [weak self, weak peerConnection] in
            guard let self, let peerConnection else { return }
            if peerConnection.connectionState == .disconnected || peerConnection.iceConnectionState == .disconnected {
                self.onClosed(peerConnection)
            }
        }
    }
}
