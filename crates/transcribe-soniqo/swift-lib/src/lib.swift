import AudioCommon
import Foundation
import MLX
import OmnilingualASR
import ParakeetASR
import ParakeetStreamingASR
import Qwen3ASR
import SwiftRs

private enum SoniqoBridgeError: LocalizedError {
  case message(String)

  var errorDescription: String? {
    switch self {
    case .message(let message):
      return message
    }
  }
}

private let soniqoFileTranscriptionSampleRate = 16_000
private let parakeetBatchMinimumChunkSeconds = 20.0
private let parakeetBatchMaximumChunkSeconds = 29.5

private enum SpeechModelKind: String, CaseIterable {
  case parakeetStreaming = "soniqo-parakeet-streaming"
  case parakeetBatch = "soniqo-parakeet-batch"
  case omnilingual = "soniqo-omnilingual"
  case qwen3Small = "soniqo-qwen3-small"
  case qwen3Large = "soniqo-qwen3-large"

  static func resolve(_ identifier: String) -> Self? {
    Self(rawValue: identifier) ?? Self.allCases.first(where: { $0.repo == identifier })
  }

  var label: String {
    switch self {
    case .parakeetStreaming:
      return "Parakeet Streaming"
    case .parakeetBatch:
      return "Parakeet Batch"
    case .omnilingual:
      return "Omnilingual ASR"
    case .qwen3Small:
      return "Qwen3 ASR 0.6B"
    case .qwen3Large:
      return "Qwen3 ASR 1.7B"
    }
  }

  var repo: String {
    switch self {
    case .parakeetStreaming:
      return "aufklarer/Parakeet-EOU-120M-CoreML-INT8"
    case .parakeetBatch:
      return "aufklarer/Parakeet-TDT-v3-CoreML-INT8"
    case .omnilingual:
      return "aufklarer/Omnilingual-ASR-CTC-300M-CoreML-INT8-10s"
    case .qwen3Small:
      return "aufklarer/Qwen3-ASR-0.6B-MLX-4bit"
    case .qwen3Large:
      return "aufklarer/Qwen3-ASR-1.7B-MLX-8bit"
    }
  }

  var isStreamingCapable: Bool {
    self == .parakeetStreaming
  }

  var fileTranscriptionChunkSeconds: Double? {
    switch self {
    case .parakeetStreaming, .qwen3Small, .qwen3Large:
      return nil
    case .parakeetBatch:
      return parakeetBatchMaximumChunkSeconds
    case .omnilingual:
      return 35
    }
  }

  var minimumFileTranscriptionChunkSeconds: Double? {
    switch self {
    case .parakeetBatch:
      return parakeetBatchMinimumChunkSeconds
    case .parakeetStreaming, .omnilingual, .qwen3Small, .qwen3Large:
      return nil
    }
  }

  var maximumFileTranscriptionChunkSeconds: Double? {
    switch self {
    case .parakeetBatch:
      return parakeetBatchMaximumChunkSeconds
    case .parakeetStreaming, .omnilingual, .qwen3Small, .qwen3Large:
      return nil
    }
  }

  func cacheDirectoryURL() throws -> URL {
    try HuggingFaceDownloader.getCacheDirectory(for: repo)
  }

  func cacheDirectoryPath() -> String {
    (try? cacheDirectoryURL().path) ?? ""
  }

  /// The byte-weighted downloader rejects any name containing a path separator
  /// (validatedRemoteFileName), so the CoreML kinds — whose weights live under
  /// `encoder.mlmodelc/...` — cannot use it and keep the file-counted path.
  var supportsByteWeightedDownload: Bool {
    switch self {
    case .qwen3Small, .qwen3Large:
      return true
    case .parakeetStreaming, .parakeetBatch, .omnilingual:
      return false
    }
  }

  /// The files downloadWeights resolves for these repos. Listed explicitly
  /// because the Hub module is not a dependency of this target and the
  /// downloader exposes no listing API — and because the byte-weighted
  /// downloader takes names, not globs.
  ///
  /// Getting this wrong is safe: an unexpected name fails the prefetch, the
  /// error is swallowed, and kind.load downloads whatever is missing the old
  /// way. The cost is progress accuracy, never the model.
  var weightFiles: [String] {
    [
      "config.json",
      "model.safetensors",
      "model.safetensors.index.json",
      "vocab.json",
      "merges.txt",
      "tokenizer_config.json",
    ]
  }

  func filesReady() -> Bool {
    guard let directory = try? cacheDirectoryURL() else {
      return false
    }

    switch self {
    case .parakeetStreaming, .parakeetBatch:
      return Self.regularFileExists(at: directory.appendingPathComponent("config.json"))
        && Self.regularFileExists(at: directory.appendingPathComponent("vocab.json"))
        && Self.compiledCoreMLModelReady(at: directory.appendingPathComponent("encoder.mlmodelc"))
        && Self.compiledCoreMLModelReady(at: directory.appendingPathComponent("decoder.mlmodelc"))
        && Self.compiledCoreMLModelReady(at: directory.appendingPathComponent("joint.mlmodelc"))
    case .omnilingual:
      return Self.regularFileExists(at: directory.appendingPathComponent("config.json"))
        && Self.regularFileExists(at: directory.appendingPathComponent("tokenizer.model"))
        && Self.directoryContainsRegularFile(
          at: directory.appendingPathComponent("omnilingual-ctc-300m-int8.mlpackage")
        )
    case .qwen3Small, .qwen3Large:
      return Self.regularFileExists(at: directory.appendingPathComponent("vocab.json"))
        && Self.regularFileExists(at: directory.appendingPathComponent("merges.txt"))
        && Self.regularFileExists(at: directory.appendingPathComponent("tokenizer_config.json"))
        && Self.directoryContainsFile(withExtension: "safetensors", in: directory)
    }
  }

  func load(progressHandler: ((Double, String) -> Void)?) async throws -> LoadedSpeechModel {
    let offlineMode = filesReady()

    switch self {
    case .parakeetStreaming:
      return .streaming(
        try await ParakeetStreamingASRModel.fromPretrained(
          modelId: repo,
          progressHandler: progressHandler
        )
      )
    case .parakeetBatch:
      return .parakeetBatch(
        try await ParakeetASRModel.fromPretrained(
          modelId: repo,
          offlineMode: offlineMode,
          progressHandler: progressHandler
        )
      )
    case .omnilingual:
      return .omnilingual(
        try await OmnilingualASRModel.fromPretrained(
          modelId: repo,
          offlineMode: offlineMode,
          progressHandler: progressHandler
        )
      )
    case .qwen3Small, .qwen3Large:
      return .qwen3(
        try await Qwen3ASRModel.fromPretrained(
          modelId: repo,
          offlineMode: offlineMode,
          progressHandler: progressHandler
        )
      )
    }
  }

  private static func regularFileExists(at url: URL) -> Bool {
    var isDirectory = ObjCBool(false)
    return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
      && !isDirectory.boolValue
  }

  private static func compiledCoreMLModelReady(at directory: URL) -> Bool {
    var isDirectory = ObjCBool(false)
    guard FileManager.default.fileExists(atPath: directory.path, isDirectory: &isDirectory),
      isDirectory.boolValue
    else {
      return false
    }

    return regularFileExists(at: directory.appendingPathComponent("model.mil"))
      && directoryContainsRegularFile(at: directory.appendingPathComponent("weights"))
  }

  private static func directoryContainsFile(withExtension pathExtension: String, in directory: URL)
    -> Bool
  {
    guard
      let contents = try? FileManager.default.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: [.isRegularFileKey]
      )
    else {
      return false
    }

    return contents.contains { candidate in
      guard
        candidate.pathExtension == pathExtension,
        let values = try? candidate.resourceValues(forKeys: [.isRegularFileKey])
      else {
        return false
      }

      return values.isRegularFile == true
    }
  }

  private static func directoryContainsRegularFile(at directory: URL) -> Bool {
    guard
      let enumerator = FileManager.default.enumerator(
        at: directory,
        includingPropertiesForKeys: [.isRegularFileKey],
        options: [.skipsHiddenFiles]
      )
    else {
      return false
    }

    for case let candidate as URL in enumerator {
      guard let values = try? candidate.resourceValues(forKeys: [.isRegularFileKey]) else {
        continue
      }

      if values.isRegularFile == true {
        return true
      }
    }

    return false
  }
}

private enum LoadedSpeechModel {
  case streaming(ParakeetStreamingASRModel)
  case parakeetBatch(ParakeetASRModel)
  case omnilingual(OmnilingualASRModel)
  case qwen3(Qwen3ASRModel)

  func asStreamingModel() throws -> ParakeetStreamingASRModel {
    guard case .streaming(let model) = self else {
      throw SoniqoBridgeError.message(
        "The selected Soniqo model does not support realtime transcription.")
    }

    return model
  }

  func transcribe(audio: [Float], sampleRate: Int, language: String?) throws -> String {
    let normalizedLanguage = language?.trimmingCharacters(in: .whitespacesAndNewlines)
    let languageHint = (normalizedLanguage?.isEmpty == false) ? normalizedLanguage : nil

    switch self {
    case .streaming(let model):
      return try model.transcribeAudio(audio, sampleRate: sampleRate)
    case .parakeetBatch(let model):
      return try model.transcribeAudio(audio, sampleRate: sampleRate, language: languageHint)
    case .omnilingual(let model):
      return try model.transcribeAudio(audio, sampleRate: sampleRate)
    case .qwen3(let model):
      return model.transcribe(audio: audio, sampleRate: sampleRate, language: languageHint)
    }
  }
}

private enum TranscriptSource: String, Codable, CaseIterable {
  case microphone
  case system
}

private struct ModelDownloadPayload: Codable {
  var status: String
  var currentFile: String?
  var progressPercent: Int?
  /// Zero when unknown. The Hub's own fraction is weighted per file, so a 2.4 GB
  /// shard counts the same as a 40 KB config and the bar barely moves; these
  /// come from the byte-weighted downloader instead.
  var downloadedBytes: Int64
  var totalBytes: Int64
  var localPath: String
  var error: String?
}

/// URLError codes that mean "this machine cannot currently reach the network",
/// as opposed to "the server said no" or "the bytes were wrong".
private let connectivityErrorCodes: Set<URLError.Code> = [
  .notConnectedToInternet,
  .networkConnectionLost,
  .cannotConnectToHost,
  .cannotFindHost,
  .dnsLookupFailed,
  .timedOut,
  .internationalRoamingOff,
  .dataNotAllowed,
]

/// The same conditions as text, because that is all that survives the trip.
///
/// speech-swift's `DownloadError.failedToDownload` is built from
/// `lastError?.localizedDescription`, so by the time a failure reaches us the
/// URLError has been flattened into a sentence and there is no underlying error
/// left to inspect. Foundation generates these strings, so generating the
/// needles the same way keeps them correct in every locale and stops them
/// drifting from whatever URLError actually produces.
private let connectivityErrorDescriptions: Set<String> = Set(
  connectivityErrorCodes.map { URLError($0).localizedDescription }
)

private func isConnectivityFailure(_ error: Error) -> Bool {
  if let urlError = error as? URLError {
    return connectivityErrorCodes.contains(urlError.code)
  }
  let description = error.localizedDescription
  return connectivityErrorDescriptions.contains { description.contains($0) }
}

private struct FileTranscriptionPayload: Codable {
  var text: String
  var durationSeconds: Double
  var error: String?
}

private struct LivePartialPayload: Codable {
  var source: String
  var text: String
  var isFinal: Bool
}

private struct LiveAppendPayload: Codable {
  var partials: [LivePartialPayload]
  var error: String?
}

private struct StatusPayload: Codable {
  var running: Bool
  var error: String?
}

private func encodeJSON<T: Encodable>(_ value: T) -> String {
  guard let data = try? JSONEncoder().encode(value),
    let string = String(data: data, encoding: .utf8)
  else {
    return "{}"
  }

  return string
}

private func waitForValue<T>(_ operation: @escaping () async -> T) -> T {
  let semaphore = DispatchSemaphore(value: 0)
  var result: T!

  Task {
    result = await operation()
    semaphore.signal()
  }

  semaphore.wait()
  return result
}

private func decodeFloatSamples(from data: Data) throws -> [Float] {
  let stride = MemoryLayout<Float>.size
  guard data.count.isMultiple(of: stride) else {
    throw SoniqoBridgeError.message("Invalid audio chunk received by Soniqo.")
  }

  let count = data.count / stride
  var samples = [Float]()
  samples.reserveCapacity(count)

  data.withUnsafeBytes { bytes in
    for index in 0..<count {
      let bits = bytes.loadUnaligned(fromByteOffset: index * stride, as: UInt32.self)
      samples.append(Float(bitPattern: UInt32(littleEndian: bits)))
    }
  }

  return samples
}

/// Caps the GPU buffer pool MLX keeps between operations, sized to the machine.
///
/// MLX retains freed Metal buffers rather than returning them, so a run of
/// transcriptions grows the pool to whatever the largest one needed and holds
/// it: measured at 6.3 GB across 6,549 IOAccelerator regions after a few
/// hundred recordings. Metal will only wire about 75% of unified memory —
/// 11.84 GiB of a 16 GB Mac — so an unbounded pool competes directly with the
/// language model, and losing that race aborted the app with
/// kIOGPUCommandBufferCallbackErrorOutOfMemory.
///
/// Flat at or below 16 GB, scaling above it. 16 GB is where the pool actually
/// crowded the language model out of Metal's wired-memory budget, so that end
/// stays deliberately tight; past it there is room to spare and the pool is
/// pure speed, so it gets an eighth of RAM up to 8 GB.
///
/// A cap, not a periodic clear, because reuse between operations is the whole
/// point of the cache.
private let gpuCacheLimitBytes: Int = {
  let physical = ProcessInfo.processInfo.physicalMemory
  let sixteenGB: UInt64 = 16 * 1024 * 1024 * 1024
  if physical <= sixteenGB {
    return 512 * 1024 * 1024
  }
  let share = Int(min(physical / 8, UInt64(Int.max)))
  return min(share, 8 * 1024 * 1024 * 1024)
}()

private let configureGPUOnce: Void = {
  MLX.Memory.cacheLimit = gpuCacheLimitBytes
}()

private actor SoniqoBridge {
  static let shared = SoniqoBridge()

  init() {
    _ = configureGPUOnce
  }

  private var loadedModels: [SpeechModelKind: LoadedSpeechModel] = [:]
  private var modelTasks: [SpeechModelKind: Task<LoadedSpeechModel, Error>] = [:]
  private var downloadStates: [SpeechModelKind: ModelDownloadPayload] = [:]
  private var activeStreamingSessions: [TranscriptSource: StreamingSession] = [:]

  func cacheDirectory(modelId: String) -> String {
    guard let kind = SpeechModelKind.resolve(modelId) else {
      return ""
    }

    refreshReadyState(for: kind)
    return kind.cacheDirectoryPath()
  }

  func modelDownloadStateJSON(modelId: String) -> String {
    guard let kind = SpeechModelKind.resolve(modelId) else {
      return encodeJSON(
        ModelDownloadPayload(
          status: "error",
          currentFile: nil,
          progressPercent: nil,
          downloadedBytes: 0,
          totalBytes: 0,
          localPath: "",
          error: "Unsupported Soniqo model."
        )
      )
    }

    refreshReadyState(for: kind)
    return encodeJSON(downloadState(for: kind))
  }

  func startModelDownload(modelId: String) {
    guard let kind = SpeechModelKind.resolve(modelId) else {
      return
    }

    refreshReadyState(for: kind)
    if kind.filesReady(), modelTasks[kind] == nil {
      var state = downloadState(for: kind)
      state.status = "ready"
      state.currentFile = nil
      state.error = nil
      downloadStates[kind] = state
      return
    }

    if modelTasks[kind] != nil {
      var state = downloadState(for: kind)
      state.status = "downloading"
      downloadStates[kind] = state
      return
    }

    var state = downloadState(for: kind)
    state.status = "downloading"
    state.currentFile = "Preparing \(kind.label)..."
    state.progressPercent = nil
    state.error = nil
    downloadStates[kind] = state

    let task = Task.detached(priority: .utility) {
      // An outer retry on top of the Hub client's own ladder, because that one
      // is exhausted in about ten minutes and is not tunable from here. A
      // closed laptop lid kills the sockets and burned every attempt while the
      // machine was asleep, so the model never arrived. These waits are long
      // enough that the process is awake again when they fire, and each retry
      // skips every file that already landed — the Hub writes a .metadata
      // sidecar only after a file completes.
      // Extended after a user's log showed both this ladder and the Hub's own
      // 300-second stall guard exhausting repeatedly on a flaky link. The
      // transfer stays reported as downloading throughout, so a long wait costs
      // patience rather than the download.
      let waitsSeconds: [UInt64] = [30, 60, 120, 300, 600]
      var attempt = 0

      // Time spent unreachable is not counted against the ladder above, so it
      // needs its own bound: six hours of a closed lid before the download is
      // called dead. Long enough to survive a night, short enough that a task
      // cannot outlive the reason it exists.
      let offlineWaitSeconds: UInt64 = 60
      let maxOfflineWaits = 360
      var offlineWaits = 0

      while true {
        do {
          // Prefetch with real byte accounting where the repo allows it. The
          // Hub's snapshot weights each file equally, so a 2.4 GB shard is one
          // of six units and the bar crawls 0% -> 13% before jumping. This
          // fetches the same files with byte-level progress; kind.load then
          // finds them present and does no network work.
          //
          // Best effort: if listing or fetching fails, fall through to load,
          // which downloads whatever is missing the old way. A wrong glob costs
          // accuracy, never the download.
          if kind.supportsByteWeightedDownload {
            do {
              let directory = try kind.cacheDirectoryURL()
              await SoniqoBridge.shared.updateDownloadStage(
                kind: kind, stage: "Checking files for \(kind.label)...")
              try await HuggingFaceDownloader.downloadFilesByteWeighted(
                modelId: kind.repo,
                to: directory,
                files: kind.weightFiles,
                // One attempt, no ladder. This call only exists to make the
                // progress bar accurate; the download itself is kind.load
                // below. A previous version passed [15, 30, 60, 120, 300] here,
                // which meant six attempts and about nine minutes of total
                // silence — resolveRemoteFiles runs before the first progress
                // callback, so a user whose metadata lookup failed watched a
                // frozen 0% while the real download had not been allowed to
                // start. Failing fast and falling through costs a nice bar and
                // saves the transfer.
                retryDelaysSeconds: []
              ) { _, completed, total, name in
                Task {
                  await SoniqoBridge.shared.updateDownloadBytes(
                    kind: kind,
                    completedBytes: completed,
                    totalBytes: total,
                    fileName: name
                  )
                }
              }
              FileHandle.standardError.write(
                Data("[soniqo] byte-weighted prefetch finished for \(kind.repo)\n".utf8)
              )
            } catch {
              if Task.isCancelled || error is CancellationError {
                throw error
              }
              // Falls through to kind.load, which fetches what is missing. Logged
              // because a silent fallback is indistinguishable from the feature
              // not existing — which is exactly how this was reported.
              FileHandle.standardError.write(
                Data(
                  "[soniqo] byte-weighted prefetch failed for \(kind.repo), falling back: \(error)\n"
                    .utf8)
              )
            }
          }

          return try await kind.load { fraction, status in
            Task {
              await SoniqoBridge.shared.updateDownloadProgress(
                kind: kind,
                fraction: fraction,
                status: status
              )
            }
          }
        } catch {
          // A deliberate cancel is not a failure to retry through.
          if Task.isCancelled || error is CancellationError {
            throw error
          }

          // An unreachable network is not a failed download, and must not spend
          // the budget below. A shut lid, a sleeping machine or a dropped link
          // fixes itself; no number of attempts fixes it sooner, and every one
          // spent brings the transfer closer to dying of something temporary.
          //
          // This is how a 1.7 GB model ended at 4.4 MB on a link that carried a
          // 13.6 GB one to completion the same night: the Rust downloader
          // classifies these as transient (is_transient, crates/file), this
          // ladder counted them like a corrupt response.
          if isConnectivityFailure(error) {
            offlineWaits += 1
            if offlineWaits > maxOfflineWaits {
              throw error
            }
            await SoniqoBridge.shared.updateDownloadOffline(
              kind: kind,
              waitSeconds: offlineWaitSeconds
            )
            try await Task.sleep(nanoseconds: offlineWaitSeconds * 1_000_000_000)
            continue
          }

          if attempt >= waitsSeconds.count {
            throw error
          }

          let wait = waitsSeconds[attempt]
          attempt += 1
          await SoniqoBridge.shared.updateDownloadRetrying(
            kind: kind,
            attempt: attempt,
            waitSeconds: wait
          )
          // Throws CancellationError promptly if the task is cancelled while
          // waiting, so a reset does not sit here for two minutes.
          try await Task.sleep(nanoseconds: wait * 1_000_000_000)
        }
      }
    }

    modelTasks[kind] = task

    Task.detached {
      do {
        let model = try await task.value
        await SoniqoBridge.shared.finishModelLoad(kind: kind, model: model)
      } catch {
        // A cancelled download is not an error state — reset and delete both
        // cancel, and writing "error" there would surface a failure the user
        // caused on purpose.
        if error is CancellationError || (error as? URLError)?.code == .cancelled {
          await SoniqoBridge.shared.clearModelTask(kind: kind)
          return
        }
        await SoniqoBridge.shared.finishModelLoad(kind: kind, error: error)
      }
    }
  }

  /// Real byte counts, from the byte-weighted downloader. Unlike
  /// updateDownloadProgress, the percentage here means what it says.
  func updateDownloadBytes(
    kind: SpeechModelKind,
    completedBytes: Int64,
    totalBytes: Int64,
    fileName: String
  ) {
    var state = downloadState(for: kind)
    state.status = "downloading"
    state.currentFile = fileName.isEmpty ? state.currentFile : fileName
    state.downloadedBytes = completedBytes
    state.totalBytes = totalBytes
    state.progressPercent =
      totalBytes > 0
      ? Int((Double(completedBytes) / Double(totalBytes) * 100.0).rounded(.down))
      : nil
    state.error = nil
    downloadStates[kind] = state
  }

  /// What the transfer is doing before any bytes can be attributed to it.
  ///
  /// The metadata lookup that precedes the first progress callback reported
  /// nothing at all while it ran, so the card sat at a frozen 0% and the log
  /// line showed percent, downloaded and total all zero — indistinguishable
  /// from a wedged download, and the state a user watched for minutes.
  func updateDownloadStage(kind: SpeechModelKind, stage: String) {
    var state = downloadState(for: kind)
    state.status = "downloading"
    state.currentFile = stage
    state.error = nil
    downloadStates[kind] = state
  }

  /// Keeps the transfer reported as in flight across a retry wait. The settings
  /// card treats "not downloading" as a hard stop, so going idle here would
  /// abort its own sequencer.
  func updateDownloadRetrying(kind: SpeechModelKind, attempt: Int, waitSeconds: UInt64) {
    var state = downloadState(for: kind)
    state.status = "downloading"
    state.currentFile =
      "Connection lost — retrying in \(waitSeconds)s (attempt \(attempt + 1))"
    state.error = nil
    downloadStates[kind] = state
  }

  /// Same contract as updateDownloadRetrying, different cause: the machine is
  /// unreachable rather than the transfer unlucky. Worth saying plainly, since
  /// "retrying (attempt 5)" reads like the download is running out of chances
  /// when nothing is being spent.
  func updateDownloadOffline(kind: SpeechModelKind, waitSeconds: UInt64) {
    var state = downloadState(for: kind)
    state.status = "downloading"
    state.currentFile = "Waiting for a network connection — retrying in \(waitSeconds)s"
    state.error = nil
    downloadStates[kind] = state
  }

  func clearModelTask(kind: SpeechModelKind) {
    modelTasks[kind] = nil
    refreshReadyState(for: kind)
  }

  func resetModel(modelId: String) {
    guard let kind = SpeechModelKind.resolve(modelId) else {
      return
    }

    loadedModels[kind] = nil
    // Cancelling matters: dropping the handle alone leaves the download running,
    // which made reset_model a no-op against a live transfer and let
    // delete_model remove_dir_all a directory Swift was still writing into.
    modelTasks[kind]?.cancel()
    modelTasks[kind] = nil
    refreshReadyState(for: kind)

    var state = downloadState(for: kind)
    if state.status != "ready" {
      state.status = "idle"
    }
    state.currentFile = nil
    state.progressPercent = nil
    state.error = nil
    downloadStates[kind] = state
  }

  func startLiveJSON(modelId: String) async -> String {
    do {
      guard let kind = SpeechModelKind.resolve(modelId) else {
        throw SoniqoBridgeError.message("Unsupported Soniqo model: \(modelId)")
      }
      guard kind.isStreamingCapable else {
        throw SoniqoBridgeError.message("\(kind.label) does not support realtime transcription.")
      }

      let model = try await ensureModelLoaded(kind).asStreamingModel()
      activeStreamingSessions = [
        .microphone: try model.createSession(),
        .system: try model.createSession(),
      ]
      return encodeJSON(StatusPayload(running: true, error: nil))
    } catch {
      activeStreamingSessions = [:]
      return encodeJSON(StatusPayload(running: false, error: error.localizedDescription))
    }
  }

  func stopLiveJSON() -> String {
    activeStreamingSessions = [:]
    return encodeJSON(StatusPayload(running: false, error: nil))
  }

  func appendLiveJSON(source: String, samplesData: Data) -> String {
    do {
      guard let transcriptSource = TranscriptSource(rawValue: source) else {
        throw SoniqoBridgeError.message("Unsupported Soniqo transcript source: \(source)")
      }
      guard let session = activeStreamingSessions[transcriptSource] else {
        throw SoniqoBridgeError.message("No active Soniqo transcription session.")
      }

      let samples = try decodeFloatSamples(from: samplesData)
      let partials = try session.pushAudio(samples).map { partial in
        LivePartialPayload(
          source: transcriptSource.rawValue,
          text: partial.text,
          isFinal: partial.isFinal
        )
      }
      return encodeJSON(LiveAppendPayload(partials: partials, error: nil))
    } catch {
      return encodeJSON(LiveAppendPayload(partials: [], error: error.localizedDescription))
    }
  }

  func finalizeLiveJSON(source: String) -> String {
    do {
      guard let transcriptSource = TranscriptSource(rawValue: source) else {
        throw SoniqoBridgeError.message("Unsupported Soniqo transcript source: \(source)")
      }
      guard let session = activeStreamingSessions[transcriptSource] else {
        throw SoniqoBridgeError.message("No active Soniqo transcription session.")
      }

      let partials = try session.finalize().map { partial in
        LivePartialPayload(
          source: transcriptSource.rawValue,
          text: partial.text,
          isFinal: partial.isFinal
        )
      }
      return encodeJSON(LiveAppendPayload(partials: partials, error: nil))
    } catch {
      return encodeJSON(LiveAppendPayload(partials: [], error: error.localizedDescription))
    }
  }

  func transcribeAudioFileJSON(modelId: String, audioPath: String, language: String) async -> String
  {
    do {
      guard let kind = SpeechModelKind.resolve(modelId) else {
        throw SoniqoBridgeError.message("Unsupported Soniqo model: \(modelId)")
      }

      let trimmedLanguage = language.trimmingCharacters(in: .whitespacesAndNewlines)
      let url = URL(fileURLWithPath: audioPath)
      let audio = try AudioFileLoader.load(
        url: url,
        targetSampleRate: soniqoFileTranscriptionSampleRate
      )
      let model = try await ensureModelLoaded(kind)
      let text = try transcribeFileAudio(
        model: model,
        kind: kind,
        audio: audio,
        sampleRate: soniqoFileTranscriptionSampleRate,
        language: trimmedLanguage.isEmpty ? nil : trimmedLanguage
      )

      return encodeJSON(
        FileTranscriptionPayload(
          text: text,
          durationSeconds: Double(audio.count) / Double(soniqoFileTranscriptionSampleRate),
          error: nil
        )
      )
    } catch {
      return encodeJSON(
        FileTranscriptionPayload(
          text: "",
          durationSeconds: 0,
          error: error.localizedDescription
        )
      )
    }
  }

  private func transcribeFileAudio(
    model: LoadedSpeechModel,
    kind: SpeechModelKind,
    audio: [Float],
    sampleRate: Int,
    language: String?
  ) throws -> String {
    guard !audio.isEmpty else {
      return ""
    }

    guard let chunkSeconds = kind.fileTranscriptionChunkSeconds else {
      return try transcribeFileAudioChunk(
        model: model,
        kind: kind,
        audio: audio,
        sampleRate: sampleRate,
        language: language
      )
    }

    let chunkSampleCount = max(sampleRate, Int((Double(sampleRate) * chunkSeconds).rounded(.up)))
    let minimumTrailingSamples =
      kind.minimumFileTranscriptionChunkSeconds.map {
        max(sampleRate, Int((Double(sampleRate) * $0).rounded(.up)))
      } ?? 0
    let maximumChunkSamples =
      kind.maximumFileTranscriptionChunkSeconds.map {
        max(chunkSampleCount, Int((Double(sampleRate) * $0).rounded(.up)))
      } ?? chunkSampleCount
    let ranges = fileTranscriptionChunkRanges(
      sampleCount: audio.count,
      preferredChunkSamples: chunkSampleCount,
      minimumTrailingSamples: minimumTrailingSamples,
      maximumChunkSamples: maximumChunkSamples
    )

    guard ranges.count > 1 else {
      return try transcribeFileAudioChunk(
        model: model,
        kind: kind,
        audio: audio,
        sampleRate: sampleRate,
        language: language
      )
    }

    var chunks: [String] = []

    for range in ranges {
      let text = try autoreleasepool {
        try transcribeFileAudioChunk(
          model: model,
          kind: kind,
          audio: Array(audio[range]),
          sampleRate: sampleRate,
          language: language
        )
      }
      let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty {
        chunks.append(trimmed)
      }
    }

    return chunks.joined(separator: " ")
  }

  private func transcribeFileAudioChunk(
    model: LoadedSpeechModel,
    kind: SpeechModelKind,
    audio: [Float],
    sampleRate: Int,
    language: String?
  ) throws -> String {
    let normalizedAudio = normalizedFileTranscriptionAudio(
      kind: kind,
      audio: audio,
      sampleRate: sampleRate
    )
    return try model.transcribe(audio: normalizedAudio, sampleRate: sampleRate, language: language)
  }

  private func normalizedFileTranscriptionAudio(
    kind: SpeechModelKind,
    audio: [Float],
    sampleRate: Int
  ) -> [Float] {
    guard kind == .parakeetBatch else {
      return audio
    }

    let minimumSamples = max(
      sampleRate,
      Int((Double(sampleRate) * parakeetBatchMinimumChunkSeconds).rounded(.up))
    )
    guard audio.count < minimumSamples else {
      return audio
    }

    var padded = audio
    padded.append(contentsOf: repeatElement(Float.zero, count: minimumSamples - audio.count))
    return padded
  }

  private func fileTranscriptionChunkRanges(
    sampleCount: Int,
    preferredChunkSamples: Int,
    minimumTrailingSamples: Int,
    maximumChunkSamples: Int
  ) -> [Range<Int>] {
    guard sampleCount > preferredChunkSamples else {
      return [0..<sampleCount]
    }

    var ranges: [Range<Int>] = []
    var start = 0

    while start < sampleCount {
      let end = min(sampleCount, start + preferredChunkSamples)
      ranges.append(start..<end)
      start = end
    }

    guard minimumTrailingSamples > 0, ranges.count >= 2, let trailingRange = ranges.last else {
      return ranges
    }

    let trailingSamples = trailingRange.upperBound - trailingRange.lowerBound
    guard trailingSamples < minimumTrailingSamples else {
      return ranges
    }

    let previousIndex = ranges.count - 2
    let previousRange = ranges[previousIndex]
    let mergedSamples = trailingRange.upperBound - previousRange.lowerBound
    guard mergedSamples <= maximumChunkSamples else {
      return ranges
    }

    ranges.removeLast()
    ranges[previousIndex] = previousRange.lowerBound..<trailingRange.upperBound
    return ranges
  }

  private func ensureModelLoaded(_ kind: SpeechModelKind) async throws -> LoadedSpeechModel {
    refreshReadyState(for: kind)

    if let model = loadedModels[kind] {
      return model
    }

    if let task = modelTasks[kind] {
      let loaded = try await task.value
      loadedModels[kind] = loaded
      return loaded
    }

    // Deliberately does not download. This runs inside transcription, where a
    // silent multi-gigabyte fetch cost a user their transcript when it failed:
    // it registers nothing in modelTasks, so is_model_downloading reported
    // false throughout and the settings card would happily start a second
    // concurrent transfer into the same cache directory. Downloads belong to
    // startModelDownload, which reports progress and can be observed.
    guard kind.filesReady() else {
      throw SoniqoBridgeError.message("\(kind.label) is not downloaded.")
    }

    let loaded = try await kind.load(progressHandler: nil)
    loadedModels[kind] = loaded
    refreshReadyState(for: kind)
    return loaded
  }

  private func updateDownloadProgress(kind: SpeechModelKind, fraction: Double, status: String) {
    var state = downloadState(for: kind)
    state.status = "downloading"
    state.localPath = kind.cacheDirectoryPath()
    state.error = nil

    let percent = Int(max(0.0, min(1.0, fraction)) * 100.0)
    let statusText = status.trimmingCharacters(in: .whitespacesAndNewlines)
    state.progressPercent = percent
    state.currentFile = statusText.isEmpty ? "Preparing \(kind.label)..." : statusText
    downloadStates[kind] = state
  }

  private func finishModelLoad(kind: SpeechModelKind, model: LoadedSpeechModel) {
    loadedModels[kind] = model
    modelTasks[kind] = nil

    var state = downloadState(for: kind)
    state.localPath = kind.cacheDirectoryPath()
    state.status = "ready"
    state.currentFile = nil
    state.progressPercent = nil
    state.error = nil
    downloadStates[kind] = state
  }

  private func finishModelLoad(kind: SpeechModelKind, error: Error) {
    modelTasks[kind] = nil

    var state = downloadState(for: kind)
    state.localPath = kind.cacheDirectoryPath()
    state.status = "error"
    state.currentFile = nil
    state.progressPercent = nil
    state.error = error.localizedDescription
    downloadStates[kind] = state
  }

  private func refreshReadyState(for kind: SpeechModelKind) {
    var state = downloadState(for: kind)
    state.localPath = kind.cacheDirectoryPath()

    guard modelTasks[kind] == nil else {
      downloadStates[kind] = state
      return
    }

    if kind.filesReady() {
      state.status = "ready"
      state.error = nil
      state.currentFile = nil
      state.progressPercent = nil
    } else if state.status == "ready" {
      state.status = "idle"
      state.currentFile = nil
      state.progressPercent = nil
      state.error = nil
      loadedModels[kind] = nil
    } else if state.localPath.isEmpty {
      state.status = "idle"
    }

    downloadStates[kind] = state
  }

  private func downloadState(for kind: SpeechModelKind) -> ModelDownloadPayload {
    if let state = downloadStates[kind] {
      return state
    }

    return ModelDownloadPayload(
      status: "idle",
      currentFile: nil,
      progressPercent: nil,
      downloadedBytes: 0,
      totalBytes: 0,
      localPath: kind.cacheDirectoryPath(),
      error: nil
    )
  }
}

@_cdecl("_soniqo_model_cache_dir")
public func _soniqo_model_cache_dir(modelId: SRString) -> SRString {
  SRString(
    waitForValue {
      await SoniqoBridge.shared.cacheDirectory(modelId: modelId.toString())
    })
}

@_cdecl("_soniqo_model_download_state")
public func _soniqo_model_download_state(modelId: SRString) -> SRString {
  SRString(
    waitForValue {
      await SoniqoBridge.shared.modelDownloadStateJSON(modelId: modelId.toString())
    })
}

@_cdecl("_soniqo_model_start_download")
public func _soniqo_model_start_download(modelId: SRString) -> Bool {
  waitForValue {
    await SoniqoBridge.shared.startModelDownload(modelId: modelId.toString())
    return true
  }
}

@_cdecl("_soniqo_model_reset")
public func _soniqo_model_reset(modelId: SRString) -> Bool {
  waitForValue {
    await SoniqoBridge.shared.resetModel(modelId: modelId.toString())
    return true
  }
}

@_cdecl("_soniqo_transcribe_audio_file")
public func _soniqo_transcribe_audio_file(
  modelId: SRString,
  audioPath: SRString,
  language: SRString
) -> SRString {
  SRString(
    waitForValue {
      await SoniqoBridge.shared.transcribeAudioFileJSON(
        modelId: modelId.toString(),
        audioPath: audioPath.toString(),
        language: language.toString()
      )
    })
}

@_cdecl("_soniqo_live_start")
public func _soniqo_live_start(modelId: SRString) -> SRString {
  SRString(
    waitForValue {
      await SoniqoBridge.shared.startLiveJSON(modelId: modelId.toString())
    })
}

@_cdecl("_soniqo_live_append")
public func _soniqo_live_append(source: SRString, samples: SRData) -> SRString {
  SRString(
    waitForValue {
      await SoniqoBridge.shared.appendLiveJSON(
        source: source.toString(),
        samplesData: Data(samples.toArray())
      )
    })
}

@_cdecl("_soniqo_live_finalize")
public func _soniqo_live_finalize(source: SRString) -> SRString {
  SRString(
    waitForValue {
      await SoniqoBridge.shared.finalizeLiveJSON(source: source.toString())
    })
}

@_cdecl("_soniqo_live_stop")
public func _soniqo_live_stop() -> SRString {
  SRString(waitForValue { await SoniqoBridge.shared.stopLiveJSON() })
}
