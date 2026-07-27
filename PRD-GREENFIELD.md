# Meeki — Greenfield Product Requirements Document

**Product:** Meeki — a private, local-first, open-source AI meeting notetaker
**Audience:** A competent developer (or coding agent) building the product from scratch, without access to any existing codebase.
**Status:** Build specification. Distilled from a mature production implementation; the numeric parameters below are empirically tuned and must be preserved unless a requirement says otherwise.

---

## 1. Product overview & positioning

Meeki is a **private Granola alternative**: a desktop app that records meeting audio (microphone + system audio, **no bot joins the call**), saves the audio file, transcribes it, and produces an editable AI summary. Everything works fully offline by default.

Three operating modes, chosen by the user:

| Mode | STT | LLM | Storage | Requires |
|------|-----|-----|---------|----------|
| **Fully local** (default) | On-device models (one-click download, ~2 GB pack) | Bundled llama.cpp server + downloaded GGUF weights | Local SQLite + local files | Nothing. No account, no network after model download |
| **BYOK** | User's own API keys (Deepgram, AssemblyAI, OpenAI, Soniox, ElevenLabs, Mistral, Gladia, Cartesia, …) | User's own keys (OpenAI, Anthropic, OpenRouter, Ollama, LM Studio, custom OpenAI-compatible, …) | Local SQLite + local files | API keys only |
| **Hosted cloud** (subscription) | Hosted STT relay | (optional) | Local-first + E2EE encrypted sync, sharing, Google/Outlook calendars | Account + Pro plan |

Core principles (all are hard requirements):

- **Local-first:** every session, note, transcript, and setting lives in local SQLite and local files. Network loss must never block reads or writes.
- **Privacy by default:** telemetry consent defaults to **false** and analytics must stay disabled while consent is unset (not only when explicitly false). API keys live in the OS keychain, never the database. Cloud sync is end-to-end encrypted with a user-held recovery key.
- **Sessions as hub:** the session is the core entity; notes, transcripts, participants, attachments, and action items all hang off sessions.
- **Graceful degradation:** every cloud or native failure degrades (batch fallback, cached data, retries) rather than killing a capture or losing data.
- **Open source & self-hostable:** the cloud API is optional and deployable by anyone; the desktop app must be fully functional with no server configured.

---

## 2. User journeys with acceptance criteria

### J1 — First run → one-click model download → record → transcript → summary
1. User installs and opens the app. Onboarding runs: **permissions → login (skippable) → calendar → final** on macOS (login → calendar → final elsewhere). Microphone and System Audio permissions are required; Accessibility is optional with an explicit "Skip Accessibility" button that appears only after the two required permissions are authorized.
2. Onboarding finishes into a pre-created welcome note that mentions the ~2 GB on-device model download.
3. User clicks one button to download the **on-device pack**: the streaming STT model + the batch STT model + a recommended local LLM sized to the machine's RAM. Progress is visible; STT download is not cancellable, LLM download has a working cancel.
4. User clicks **Record**. Live captions appear within seconds (local streaming model). User clicks **Stop**.
5. The recorded file is re-transcribed with the local batch model (authoritative transcript replaces the ephemeral live preview), then a summary streams in and persists.

**Accept:** with no account and no network (post-download), steps 4–5 produce `audio.mp3` under the session folder, a word-level transcript with mic/system channel attribution, and a persisted summary. Quitting mid-recording and relaunching recovers the session via batch repair from the audio file.

### J2 — Calendar-triggered meeting
1. User connects Apple Calendar (free, local) or Google/Outlook (Pro).
2. 5 minutes before an event, a persistent notification fires ("Starting in N minute(s)"). Clicking it opens/creates the linked session; recording auto-starts **only if** the event has already started at click time.
3. Alternatively, the in-app countdown auto-starts recording at event start (setting `auto_start_scheduled_meetings`, default true), and auto-stop fires when the meeting app releases the microphone.

**Accept:** opening a note whose event already started must NOT auto-start recording (armed-countdown guard). Two near-simultaneous entry points (notification click + countdown) converge on exactly one session.

### J3 — Mic-detection triggered
1. User joins a call in any app. After the app has held the mic continuously for 15 s (configurable 5/10/15/30/60/120 s), a notification asks "Are you in a meeting?" — personalized from calendar context when an event is within ±15 min ("Are you talking to NAME right now?").
2. Accepting starts recording immediately. A footer action offers "Ignore X?" to permanently exclude that app. After firing, that app enters a 10-minute cooldown.

**Accept:** the default ignore list (dictation tools, IDEs, screen recorders, AI assistants, the app itself) prevents false prompts; a recording already in progress swallows the event and merges trigger apps instead of prompting.

### J4 — Import an audio file
1. User drags an audio file (wav/mp3/m4a/flac/aac/ogg/aiff/caf; single file) onto a note. The window comes to front on drag-enter.
2. The file is decoded by content sniffing (extension advisory only), re-encoded to 16 kHz mp3 under the session, and batch-transcribed with progress; a summary follows.

**Accept:** a warning toast fires before first import if the local STT pack is not yet downloaded (so a ~2 GB fetch doesn't look like a hang). Import failure surfaces a typed error; the original file is untouched.

### J5 — BYOK setup
1. User opens Settings → Transcription (or Intelligence), picks a provider, pastes an API key. The key is stored in the OS keychain (never the DB) and validated.
2. Live capture streams to the provider over WebSocket; if the socket fails mid-meeting, capture continues and a batch pass repairs the transcript after stop.

**Accept:** deleting the row from the database never reveals a key; a 401 from the provider maps to a clear "check your API key" message; recording never dies because a provider socket died.

### J6 — Subscribe to cloud
1. User signs in (OAuth/email via the auth provider), starts a 21-day Pro trial (auto-started once after onboarding sign-in).
2. Enabling Cloud Sync forces E2EE setup: a recovery key (`meeki-e2ee-v1:` + base64url of 32 random bytes) is generated, shown once, and stored in the OS keychain. Sync can never be enabled without an E2EE identity.
3. Sessions sync (encrypted, field-level) across devices; the user can share a note via link/invite/public slug (shared snapshots are deliberately plaintext, published explicitly).

**Accept:** the server never sees table names, row ids, column names, or plaintext values for synced domain data. Sign-out is refused while unsent local changes exist.

---

## 3. Functional requirements by subsystem

Requirements are written as testable "must" statements. Each subsystem carries its **build difficulty** (1–5) from analysis of the reference implementation, and a **Hard-won traps** callout listing behaviors that only reveal themselves as production bugs.

---

### 3.1 Audio capture & processing — difficulty 5/5

*(CoreAudio process-tap expertise, RT-safe lock-free plumbing, three ONNX models with exact block geometries, a tuned GCC-PHAT lock state machine, and an actor supervision tree refined through production incidents.)*

#### Pipeline format
- The realtime pipeline must run at **16,000 Hz mono f32 per channel**, chunked as `chunk_size = rate × 120 ms` clamped to [1024, 7168] samples (**1920 samples = 120 ms at 16 kHz**; 120 ms follows Deepgram's streaming recommendation — all downstream constants are calibrated in units of this chunk).

#### Device capture (mic)
- Mic capture must use the OS default audio host. Device selection order: named device → default input → first available input. Every candidate list must **exclude** any device whose name contains the app's own tap-device sentinel name (e.g. `meeki-audio-tap`, substring match) — in listing, default selection, and both fallbacks — otherwise the app can select its own loopback aggregate as the microphone. Use each device's native rate/format; support i8/i16/i32/f32; downmix interleaved multichannel to mono by per-frame averaging.
- Audio callbacks must never block or allocate: samples pass through a pre-allocated scratch buffer (8192 f32) into a lock-free SPSC ring buffer (65,536 f32 capacity, 256-sample read granularity). When the ring is full, excess samples are **dropped** (counted atomically), never waited on; drop warnings rate-limited to 1 log/second with accumulated counts. Reader wakeups use an atomic waker guarded by a `wake_pending` flag (store true → register waker → retry pop → store true again) to avoid both lost wakeups and per-callback executor wakes.
- The mic stream object must live on a dedicated OS thread blocking on a channel (macOS stream handles are not Send); dropping the public handle or a stream error must set an `alive` flag false and wake the reader so the async stream ends with None instead of hanging (this is how mid-recording device failures surface).

#### System-audio capture (macOS)
- System audio must use a **CoreAudio process tap** (macOS 14.4+): create a mono global tap excluding no processes, then a **private aggregate device** with `is_private=true`, `tap_auto_start=false`, name = the tap sentinel, uid = random UUID, tap list = [sub-tap uid]; attach an IO proc reading input buffer[0], then explicitly start the device. The IO proc must handle PcmF32/F64/I32/I16, skip zero-size/null buffers, and verify pointer alignment before reinterpreting (prevents rare UB crashes).
- The tap's sample rate must be re-probed only when the reader's local buffer is empty and only every **128th** such poll; the rate reported to the resampler updates **only when a new chunk is popped**, so already-buffered samples keep the rate they were captured at (a device switch 48 kHz→44.1 kHz otherwise mangles buffered audio; pin with a unit test).
- While capture is active the app must continuously play **inaudible silence** to the default output (2 ch, 48 kHz, infinite zero source) — this keeps the output device rendering so the tap doesn't stall when no app plays sound. Omission fails only intermittently.
- Dual-capture open order: **mic first, sleep 50 ms, then the speaker tap** (empirical CoreAudio init-order workaround; simultaneous open fails intermittently).

#### Resampling and pairing
- Each source resamples to 16 kHz with an async polynomial resampler (cubic, fixed input block = chunk size, max relative ratio 2.0, mono; passthrough at equal rates). On a mid-stream source-rate change: hold the first new-rate sample pending, drain the old resampler (full blocks, then one padded partial block), emit leftover output, rebuild for the new ratio, then push the held sample. Rate is checked after **every** sample.
- A Joiner must pair mic/speaker chunk streams: emit a pair when both queues have a chunk; if one side is empty while the other accumulated **more than 4 chunks (~480 ms)**, emit the available chunk paired with same-length silence; cap each queue at **30 chunks (~3.6 s)** dropping oldest with a warning.

#### Time alignment (GCC-PHAT) + AEC
- Before echo cancellation, mic and speaker must be time-aligned by a GCC-PHAT sync probe: measure lag once per 16,000 processed samples (1 s) over a 16,384-sample window; when Locked/Holdover, apply an integer-sample delay line to the **lagging** side, max delay 9600 samples (600 ms); min reference overlap 400 ms. On any alignment change, reset AEC state and the linear echo gain. The probe's observe call must be wrapped in panic-catching (log and continue unaligned) — it once panicked in production and killed capture. MacBook speaker→mic paths routinely show ~450 ms lag; without explicit alignment the AEC does nothing.
- The probe must be a state machine Searching → Acquiring → Locked → Holdover → Lost with hysteresis: accept a window only if both sides' RMS ≥ 0.003 and peak_ratio/distinctiveness meet **acquire** thresholds (10.0 / 1.15) before lock, or **hold** thresholds (8.0 / 1.05) while locked; lock after 3 accepted measurements within a 4-window history clustered within ±24 samples; while locked reject lag outliers > 48 samples from the stable median; stable lag = median of last 5 accepted lags; enter Holdover on rejection; drop to Lost (full reset) after 3 consecutive rejections. Every one of these nine constants is tuned on real hardware.
- GCC-PHAT computation: FFT length = next power of two of 2× window (32,768 in production); remove the mean from each window; cross-spectrum normalized to unit magnitude per bin (zero when |·| ≤ ε); search lags in [−max, +max]; peak_ratio = peak / mean(|corr| excluding peak); distinctiveness = peak / max(|corr|) excluding lags within ±3 samples of the peak (mean removal + the ±3 exclusion make distinctiveness usable on self-correlated speech).
- Echo cancellation must be a **DTLN-aec two-stage ONNX model on 512-sample blocks with 128-sample shift** (32 ms / 8 ms @16 kHz), 257 FFT bins, LSTM state size 128: stage 1 (mic magnitude spectrum + states + loopback magnitude) → 257-bin mask applied to the mic complex spectrum, IFFT ÷512; stage 2 (masked time block + states + raw loopback block) → output, combined via overlap-add. Streaming mode processes ⌊len/128⌋ blocks per call with persistent state; output peak-normalized by 0.99/max only when max > 1.0. Block size/shift are baked into the trained model. Verify streaming vs batch equivalence (RMS ≤ 0.05, spectral centroid within 300 Hz) — overlap-add bookkeeping is easy to get subtly wrong.
- A **linear residual-echo canceller** must follow the neural AEC, subtracting gain×speaker per chunk: skip if processed RMS < 1e−4, speaker RMS < 1e−4, or normalized cross-correlation < 0.12; instantaneous gain = cross/speaker_energy clamped to ±1.25; if residual ratio > 0.08 (double-talk suspected) compute a robust gain: 8 segments, keep those passing the correlation gate, require ≥ 3, trim len/6 from each sorted end when ≥ 6 remain, energy-weighted mean; smooth with EMA α = 0.12 and use the smoothed value during double-talk; clamp output to [−1, 1]. This stage exists because DTLN leaves a correlated linear residual; the double-talk branch keeps the canceller from eating near-end speech.
- Every frame delivered downstream must carry three tracks: `raw_mic`, `raw_speaker`, and **optional** `aec_mic` (None when AEC init/processing failed — AEC failure only logs, never kills capture; an env switch must disable AEC entirely). Consumers use `aec_mic ?? raw_mic`.

#### Fan-out, VAD gating, levels
- Per-frame dispatch: select preferred mic (zeros of speaker length in speaker-only/onboarding mode; zeros when muted — muted audio keeps flowing as silence so the timeline and recording stay continuous), apply an energy+VAD mask that zeroes non-speech mic frames (hangover 6 frames, RMS floor 0.0005, **start-in-speech = true**, prediction failure counts as speech — the mask may only remove obvious silence), then fan out to recorder, replay history, amplitude meter, and STT routing. VAD frame size chosen from {160, 320, 480} samples preferring the largest divisor of the chunk (1920 → 480). The saved mic channel is therefore AEC'd + VAD-masked, not raw.
- Audio level UI events at most every **100 ms**: RMS of finite samples → dB → normalized ((dB+60)/60 clamped 0..1) → EMA α = 0.7 → ×1000 as u16 per channel. Filter non-finite samples before RMS (garbage device buffers produce NaN levels).
- When the STT listener is unavailable, frames queue in a bounded buffer of **150 chunks (~18 s)** dropping oldest with one overflow warning; a rolling **5-second replay history** is always maintained. On listener (re)attach, backlog drains via a quota drip: +0.25 quota per live frame, capped 2.0, primed 1.0 — i.e. ~25% extra bandwidth, never a burst (providers drop or rate-limit bursts). Replay lets a restarted listener re-send the last 5 s; transcript offset = elapsed − replay duration.
- Audio to the STT listener is converted f32 → i16 LE and forwarded into a channel of capacity 32 using non-blocking try_send (a stalled socket must exert zero backpressure on capture).

#### Recording to disk
- The recorder must write `sessions/<id>/audio.wav` as 32-bit float PCM, 16 kHz, stereo with **mic = left, speaker = right** (mono duplicated into stereo; unequal pairs zero-padded), flushing at most once per second (bounds crash data loss). Resuming an ended session must decode an existing `audio.mp3` (or `audio.ogg`, to mono when channels are bit-identical) back to WAV via a `.tmp` + rename, delete the compressed file, and append.
- On stop: finalize WAV, encode to `audio.mp3` with LAME (mono 64 kbps / stereo 128 kbps, near-best quality); on success **fsync the mp3 AND its directory**, delete the WAV, fsync the directory again; on encode failure **keep the WAV** (fsync file + dir). Consumer resolution order: `audio.mp3` → `audio.wav` → `audio.ogg`. Directory fsync after rename/delete is required for crash durability on macOS.

#### Session actor supervision
- The capture session must be an actor supervision tree: Root (one active session at a time; tracks finalizing sessions) → Session supervisor → children **Recorder (spawned first), Source, then Listener spawned in post-start** — so an STT connect failure degrades to batch fallback instead of killing the session. Root refuses to start a session id still finalizing.
- Source/recorder crashes restart with budget: **max 3 restarts per 15 s window, counter reset after 30 s quiet**; each restart retries spawn 3 times with exponential backoff 100/200/400 ms (delay before every attempt); exceeding budget stops everything with reason `restart_limit_exceeded`. A source stop with reason `device_change` restarts **without** counting against the budget (users toggling AirPods would otherwise melt the session).
- Default-input device changes are detected via CoreAudio property listeners on a dedicated run-loop thread, debounced **1000 ms** with per-event-type keyed dedup (macOS fires bursts per physical switch); the source actor stops itself with reason `device_change` and is respawned, re-opening capture and resetting pipeline state (VAD, EMA, buffers, replay).
- Listener (STT socket) failures must degrade, not kill: enter batch-fallback and retry reconnects at delays **[2, 5, 10, 20, 30] s** (capped 30 s; counter resets on success); HTTP 401/403 must NOT retry. Exception: sessions using the local live model (no fallback exists) stop the session on listener failure.
- The listener receive loop applies a **15-minute** read-inactivity timeout (long silent stretches are normal); on shutdown send finalize and drain responses for ≤ 5 s or until the expected number of finalize acknowledgments arrive (2 for dual-socket providers — waiting for one loses the other channel's tail). Socket connects: 4 s timeout, 2 attempts, 1 s apart. VAD redemption query param 400 ms (60 ms during onboarding).
- Shutdown stop order is pinned: **source → listener → recorder**, each stop-and-wait with a 30 s timeout. Stopping the listener before the source casts buffered frames into a dead actor (regression happened; test the order).

#### Speech models (local DSP)
- Speech-gating VAD must be Silero v6-class ONNX: 512-sample chunks @16 kHz, each inference = 64-sample rolling context + 512 new samples, LSTM state (2,1,128). The 64-sample context prepend is required by v5+ models and easy to omit (outputs stay plausible but degrade).
- Batch speech chunking (for batch STT) per 512-sample frame: enter speech at prob > 0.5; while speaking use an **adaptive negative threshold decaying linearly from 0.80 to 0.35 as accumulated speech grows 3 s → 20 s**; confirm speech after 90 ms (emit with 600 ms pre-speech pad); end after 600 ms below threshold (excluding redeemed silence from emitted samples); discard unconfirmed speech. Post-process: chunks with < 200 ms detected speech merge with a follower when the gap ≤ clamp(redemption, 100..250 ms) (gap zero-filled). This produces STT-friendly 3–20 s chunks without hard cuts; tests must pin no-sample-loss and monotonic non-overlapping chunks.
- AGC (ancillary paths): target RMS 0.03, distortion factor 0.0001, with gain **frozen** (not skipped) on non-speech frames — freezing prevents AGC noise-breathing.
- Denoiser (enhance path): DTLN two-stage ONNX, same 512/128/state-128 geometry, single-input. Speaker segmentation: pyannote-style ONNX on 10 s windows stepped 1.0 s, per-frame powerset argmax → speech 0/1, frames of 270 samples starting at offset 496 (the model's receptive-field geometry — wrong frame-center math shifts every diarization timestamp), Hamming-weighted overlap averaging, onset/offset both 0.5.
- Loudness normalization (playback/export): −23 LUFS integrated (EBU R128, updated every 512 samples, gain applied only when measured LUFS is finite and < 0) with a −1 dBTP true-peak limiter implemented as a 10 ms lookahead delay line.

> **Hard-won traps (audio):**
> - Tap-device exclusion from mic enumeration (feedback loop otherwise) — filter in *every* selection path.
> - `tap_auto_start=false` + explicit device start ordering; mic-then-50ms-then-tap.
> - Silence keepalive to the output device — omission fails only when no other app plays audio.
> - Rate-change resampler drain (pending-sample + drain dance) — the difference between a click-free device switch and garbled audio.
> - GCC-PHAT alignment is *necessary*, not optional: ~450 ms speaker→mic lag defeats DTLN's implicit window entirely.
> - `device_change` exempt from the restart budget; 1 s keyed debounce of CoreAudio notification bursts.
> - Drop-not-block everywhere near the RT thread; wake_pending double-check pattern.

---

### 3.2 Transcription (STT) — difficulty 5/5

*(Native CoreML/MLX inference bridged over a blocking C ABI, a dozen provider adapters normalized to one wire shape, tuned echo gating, and a crash-safe capture/repair state machine whose correctness depends on ordering and sentinel strings.)*

#### Two-model local design (load-bearing)
- When any local on-device STT model is selected, live capture must **always** stream through a dedicated small streaming model (Parakeet-EOU-120M CoreML INT8, ~120 MB — the only realtime-capable local model) for UI preview, and after stop must **always** re-transcribe the recorded file with a batch model (default: Qwen3-ASR large; also selectable: Qwen3 small, Parakeet batch). The live preview is deliberately **ephemeral**: its persist callback is a no-op (words live only in UI state, no transcript row), and the post-stop batch writes the only transcript. For all other providers, live words persist incrementally (transcript row created lazily on first non-empty delta). Batch promotion passes a replace-transcript id **only when a live DB row actually exists**.
- The **on-device pack** is the pair [streaming model, batch model]: requesting a download of either must download both, and the local STT connection reports ready only when **both** are downloaded (otherwise a meeting could end with an ephemeral preview and no batch model to persist a transcript). The local engine has no server process; represent it with a virtual base-URL sentinel (e.g. `local://stt`) so provider plumbing that expects base URLs still works.

#### Post-stop decision & crash recovery
- Post-stop decision function over {liveTranscriptionActive, needsBatchRepair, transcriptWriteFailed, audioPath}: return `enhance_only` when live was active AND no repair needed AND no write failure AND not always-batch-after-live (which is true exactly for the ephemeral local preview); else `batch_then_enhance` when audio exists; else `none`. Repair reasons are a 3-value enum: `live_transcription_unavailable`, `live_stream_incomplete`, `transcript_persistence_failed` — they drive different user-facing messages; do not collapse them.
- A durable **capture lifecycle marker** must be written to the DB *before* recording starts and cleared only after transcript+summary finalization: key `capture_lifecycle_pending:<sessionId>`, fields {version:1, phase: capturing|finalizing, sessionId, transcriptId, startedAt ms, audioOffsetMs, preserveExistingTranscript, provider?, model?, summaryMode?}. Upsert overwrites only when transcriptId matches (SQL conditional conflict clause); clear is conditioned on transcriptId (prevents a concurrent second capture from clobbering another capture's recovery state). On relaunch, a present marker drives recovery: attach to a still-live native session, else finalize with needsBatchRepair=true from the audio file. Persisting audioOffsetMs pre-recording is what allows correct trimming after a crash.
- Batch repair with a prior transcript must transcribe the **whole** session audio, then trim to the current capture: audioOffsetMs = min(existingDurationMs, finalDurationMs) only if finalDurationMs + **1000 ms** ≥ existingDurationMs, else 0; drop words with end ≤ offset; shift the rest by −offset clamped ≥ 0; drop speaker hints whose word was trimmed. The 1000 ms tolerance absorbs codec rounding — without it a valid capture zeroes out and earlier content duplicates.
- If a current-capture batch promotion yields zero words, fail with the exact sentinel error `Batch transcription did not include the current recording.` and keep the recording. Detect user-stop by the exact sentinel `Transcription stopped.` (silent recovery scheduling, no error toast). Auth errors are detected by regex `/authentication failed|invalid_token|unauthorized|\b401\b/i`. These strings cross an FFI/event boundary and are part of the wire contract.
- After failed batch repair or failed transcript persistence, the audio file must be retained **regardless of the user's retention policy** — the recording is the only source for a later repair.
- Batch provider fallback: use the user-selected provider only if it passes the language-support check for session languages; otherwise **silently** (log only, no toast — automatic repair fires constantly) fall back to the local batch model. A language-support RPC error is treated as supported (fail open). On a 401 from the hosted relay, refresh the auth session once and retry, resetting any staged words first (prevents duplicates).

#### Provider adapter contracts
- Every realtime BYOK provider implements: provider name; language-support check; native-multichannel capability; WebSocket URL builder (+ async variant for token exchange); auth-header builder; optional keep-alive message (sent every **5 s** when present); finalize message (default `{"type":"Finalize"}`); audio-to-message (default binary frame); optional initial JSON config message; and a response parser that normalizes to **one Deepgram-shaped stream response** (Results/Metadata/SpeechStarted/UtteranceEnd/Error with is_final / speech_final / from_finalize / channel_index). This normalization is the keystone of provider-agnosticism.
- Dual-channel live audio: if the adapter supports native multichannel, interleave mic/speaker i16 LE into stereo frames (mic sample first, pad the shorter side) on one socket; otherwise open **two sockets** with identical params and remap responses to channel_index [0,2] (mic) / [1,2] (speaker). Finalize goes to **both** sockets (expected finalize count 2 vs 1); the stop path waits for that count.
- Batch adapter contract: transcribe file → Deepgram-shaped batch response (channels[].alternatives[]{transcript, confidence, words[]{word, start, end, confidence, channel, speaker?, punctuated_word?}}). Channel count and sample rate are read from the local audio file's metadata before dispatch. Stream→batch word conversion hardcodes channel 0; callers **must** overwrite it per channel or mic/system attribution collapses.
- Direct batch HTTP calls are wrapped in a timeout of **clamp(2 × audio_duration + 5 min, 15 min, 6 h)** (unreadable duration → 15 min floor); on timeout the in-flight request must actually be cancelled and surface a `timed_out` code. Providers occasionally hang forever on large uploads.
- Progressive (streamed) batch applies a **30 s** per-item inactivity timeout, completes on Result/Terminal events, and errors on early stream end. The word accumulator dedupes exact (start, end, word, punctuated_word) tuples and **replaces** the list only when a from_finalize response starts ≤ 0.0 and covers at least the current last word (distinguishes full corrected snapshot from incremental tail without provider flags).
- URL routing convention: the hosted relay and a local sidecar can share localhost — disambiguate purely by an `/stt` path segment (loopback + `/stt` → relay adapter with Bearer auth; loopback without → local sidecar adapter). Scheme ws/http for loopback hosts (127.0.0.1, localhost, 0.0.0.0, ::1), wss/https otherwise.
- Language handling: session language list = [primary AI language, …spoken languages] deduplicated by base code (first occurrence wins), with a later region-less entry replacing an earlier regional one (en-GB then en ⇒ en). The local streaming model supports exactly 25 European languages ({bg,cs,da,de,el,en,es,et,fi,fr,hr,hu,it,lt,lv,mt,nl,pl,pt,ro,ru,sk,sl,sv,uk}); pass **at most one** (the first supported) to a live session; all-unsupported → empty list (auto-detect) but still run live (multiple languages degrade it; one unsupported language errors; the batch model handles the language anyway). Deepgram specifics: 0 languages ⇒ `detect_language=true` batch / `language=en` live; multi ⇒ `language=multi` only for nova-2 {en,es} or nova-3 {en,es,fr,de,hi,ru,pt,ja,it,nl} when every requested language is in the set; otherwise per-language constrained detect (33-code list) for batch, first-language for live.
- Per-model live/batch mode table is required (vendors sell the same brand as separate ids): e.g. AssemblyAI universal-3-pro=batch / u3-rt-pro=live; ElevenLabs scribe_v2=batch / scribe_v2_realtime=live; Mistral voxtral-mini=batch / …-realtime=live; Soniox stt-async=batch / stt-rt=live. Live-incapable providers and batch-only providers must be flagged in the catalog; guessing wrong silently yields no captions or a failed batch.
- Raw provider errors must be normalized (case-insensitive substring): 401/unauthorized → API-key message; 403 → permission; 429 → wait-and-retry; timeout → connection timeout; connection refused/network → connectivity; invalid audio/codec → unsupported file; file not found → recording moved/deleted; else pass through. The mapped 401 string doubles as the auth-refresh retry trigger — it is load-bearing, not cosmetic.

#### Transcript data semantics
- Word format (Deepgram-shaped): {word, start, end (f64 s), confidence, speaker?, punctuated_word, language}; channel semantics everywhere: **0 = direct mic, 1 = remote party (system audio), 2 = mixed**. channel_index is a vector [index, total], not a scalar; remap only rewrites element 0 when it equals the expected source. DB persistence converts to ms with string word ids.
- Speaker hints are separate rows tied to word ids with **deterministic ids**: provider diarization → `<wordId>:provider_speaker_index`; user assignment → `<anchorWordId>:user_speaker_assignment` (channel scope) or `…:segment` with an explicit word-id set. Inserting a new assignment removes prior conflicting-scope assignments. After live word replacement, segment-scope hints must re-grow their word set by walking neighbors with the same (channel, speaker_index) across gaps ≤ **3000 ms** — otherwise user speaker labels vanish whenever the provider finalizes interim words.
- Words without provider timestamps get synthetic timing: **0.4 s per word** from chunk start (never stretched over real audio duration), min 0.05 s; mark metadata `timing.source='synthetic_text'` and exclude such words from click-to-seek.
- Unknown speakers label as "Speaker N" in first-appearance order of distinct (channel, speaker_index, human_id) keys, with N **capped at the known participant count** when > 1 (prevents "Speaker 7" in a 2-person call); un-assigned direct-mic segments label as the current user; remote segments label as the unique non-self participant only when exactly one exists.
- Keyword boosting: union of session participant names (excluded participants omitted) → calendar participant names → user dictionary terms → extracted keyphrases (max 50 candidates) and #hashtags; truncate to **50 hints** — participant names first so truncation keeps the highest-value class.
- Live delta application: {new_words, replaced_ids} → remove replaced/duplicated ids, append, re-sort by start; words/hints live in one JSON cell, so concurrent writers (live deltas vs speaker-assignment UI) must use a dirty-flag registry and reload before applying. All transcript writes during capture flow through a serialized promise chain with a database-lock retry helper; a write failure sets transcriptWriteFailed (feeds repair) rather than aborting capture.
- Persisted-vs-live display merge: drop persisted segments duplicated by live ids; drop persisted words replaced by live words or overlapping ≥ **80%** (of the shorter word) with a pending replacement bucketed in **1000 ms** windows keyed by (channel, speaker_index, bucket) — this is what prevents visible double text during batch promotion.

#### Local inference engine (native bridge)
- The native (Swift) bridge owns model-id resolution, Hugging Face downloads with progress, cache layout, readiness checks, in-memory model caching with single-flight loads, dual live sessions keyed by source ('microphone'/'system', both created up front), and file transcription with model-specific chunking. All FFI functions are **synchronous C ABI returning JSON strings**; audio crosses as LE f32 byte buffers (length must be a multiple of 4). Errors return in-band as `{error}` JSON — never thrown across FFI. The bridge blocks its calling thread on a semaphore, so every host call must run on a blocking-thread pool, never the async runtime.
- Parakeet batch chunking: fixed windows of exactly **29.5 s (472,000 samples)** with a **20 s minimum** (zero-padded natively; a shorter trailing chunk merges into the previous when merged ≤ 29.5 s). These bounds exist because the compiled CoreML graph requires mel frame counts in **(2000, 3000]** at a 160-sample hop (20 s → 2001 frames, 29.5 s → 2951); violating either bound crashes or corrupts the model. Omnilingual chunks at 35 s; Qwen3 is unchunked. Other models use VAD-based chunking (§3.1).
- Local batch pre-processing: read channels/rate from the file; resample to 16 kHz; split channels; collapse stereo to mono when channels are effectively identical (length diff ≤ 1 sample AND mean |difference| < 0.0005) — halves work for mixed recordings. Chunk failures are skipped; a channel fails only when all its chunks fail; the batch fails only when all channels fail; a failed channel must still occupy its slot as an empty transcript (0.05 s) so surviving channels keep their index — dropping it silently flips every speaker attribution. Progress: 0.05 after planning, then 0.05 + (done/total)×0.90 capped 0.95.
- Local live loop: buffer i16 LE per source; flush to the native session every **250 ms** (missed-tick delay behavior — no catch-up bursts after a blocking native call); i16→f32 by ÷32,767; per-source seconds cursor for partial timing; finalize flushes remaining audio then finalizes mic-then-system; a Drop guard stops the native session if the wrapper dies without stop().
- **Echo gate for dual local live capture:** before buffering, zero a mic chunk when echo-dominant vs the speaker chunk — best normalized cross-correlation over lag 0 and ±80..±1600 samples step 80; suppress only if correlation ≥ 0.55 AND residual ratio ≤ 0.45 AND mic RMS ≥ 0.0025 AND speaker RMS ≥ 0.01, min 512 overlapping samples. Without this, AEC residual re-transcribes the remote party as "you"; the four thresholds were tuned so genuine double-talk never suppresses.
- Model download state machine (native-owned): {idle, downloading, ready, error} with current-file label and integer percent; start is idempotent; readiness is **deep file-presence checking** (down to compiled-model internals — e.g. `model.mil` + weights inside each `.mlmodelc`; tokenizer/config/safetensors per model family) because HF downloads can leave partially-materialized directories that pass exists() and then crash CoreML at load; stale 'ready' downgrades to 'idle' (evicting the cached model) when files disappear.
- The host polls native download state every **250 ms for at most 7200 iterations (~30 min)**, translating to Downloading(percent)/Completed/Failed events; the UI polls downloaded/downloading every **1000 ms** — progress is push, completion detection is poll (events can be missed across window reloads; the poll is the source of truth).
- Optionally seed prebundled weights from app resources into the model cache only when the destination is missing/empty, **resolving symlinks and copying targets** (HF snapshot layouts are symlink farms; naive recursive copy produces dangling links that pass exists() but fail to load).
- Platform gating: local inference is compile-time restricted to macOS Apple Silicon; every entry point returns "unsupported platform" elsewhere **except live-stop, which must succeed as a no-op** (Drop guards call it unconditionally on all platforms). MLX-based models additionally require macOS 15 (set as the app minimum).
- Whisper.cpp fallback engine (optional local alternative): skip chunks < 0.1 s; greedy sampling (temp 0.0, inc 0.2), single segment, suppress blank/non-speech, rolling previous-output prompt; strip trailing `..`+ runs; drop hallucination segments whose trimmed lowercase text is 'you', 'thank you', 'you.', 'thank you.', '♪' or confidence < 0.005 (field-reported silence-hallucinations); **flash attention must stay disabled on macOS (hard crash)**.
- Every batch run emits typed events: batchStarted → (batchResponse + batchCompleted) | batchFailed with a typed snake_case code (timed_out, batch_capability_unsupported, progressive_stream_timeout, …); progressive runs add per-item progress events. The frontend distinguishes retry-worthy failures from configuration errors purely by these codes.

> **Hard-won traps (STT):**
> - The two-model split and ephemeral live preview — persisting the preview forces visible transcript flips and delete-nonexistent bugs.
> - The +1000 ms offset tolerance; sentinel error strings as wire contract.
> - expected_finalize_count = 2 on split-socket providers.
> - Parakeet's (2000, 3000] mel-frame window ⇒ the odd 29.5 s / 20 s chunk geometry.
> - Channel-slot preservation on partial failure; channel 0 hardcode in word conversion.
> - The echo gate's four thresholds; sync-FFI-over-semaphore ⇒ spawn_blocking everywhere.
> - Deep file checks + symlink-resolved seeding for model readiness.

---

### 3.3 On-device LLM & summarization — difficulty 4/5

#### Runtime
- The app must bundle a **llama.cpp `llama-server`** runtime (~50 MB of binaries/dylibs in app resources) so local summarization needs no second install. Weights are never bundled; they download from Hugging Face on demand into `<data-dir>/models/llm/<file>.gguf`.
- Launch flags: `--model <path> --host 127.0.0.1 --port <free> --ctx-size 65536` (env-overridable, clamped 8192–262144), `--reasoning-format deepseek` (thoughts land in a separate reasoning field, never the note), `--reasoning-budget -1`, `--chat-template-kwargs {"enable_thinking":false}`, `--sleep-idle-seconds 300`, `--alias <openai_model_id> -ngl 99`. KV cache is allocated up front (~20 KB/token for Gemma-class models; 64k ≈ 1.3 GB) — ctx-size costs memory whether used or not.
- **Idle sleep:** after 300 s idle the server unloads weights (~9.3 GB RSS → ~80 MB measured with a 7.1 GB model); the next request reloads (~3.0 s warm page cache, ~4.8 s evicted). llama-server **rejects `--sleep-idle-seconds 0` and exits**; map any configured value ≤ 0 to `-1` (disabled) and floor positive values at 30 s (reload thrash).
- Model warm-up estimate: `warmup_seconds = 1 + model_size / 1.5 GB/s`. Because a sleeping server's process stays alive, the reload lands inside an ordinary HTTP request with no non-waking status endpoint reporting it — detect warm-up at the transport: flag it when response headers take > 900 ms, then render a countdown against the estimate (cap at 95%, switch to indeterminate on overrun). Add the remaining estimate to the stream-start timeout so a reload is not mistaken for a stall.
- `/health`, `/props`, `/v1/models` answer without waking a sleeping server; **`/slots` and `/metrics` wake it** — never use them for status polling. The keep-alive loop (5 s while local LLM selected) must check process liveness only (no HTTP), so it does not defeat idle sleep.
- Server lifecycle: start is idempotent (reuse a live server for the same model, else replace), started outside the state lock (a slow load must not block downloads/status); the URL getter prunes crashed processes; switching provider away stops the server.
- Model catalog with RAM-based recommendation (`recommended = largest model fitting Metal's ~75% working-set budget with ~2 GB spare for KV cache`):

| Total RAM | Recommended | Download | Min RAM |
|-----------|-------------|----------|---------|
| ≥ 22 GiB | Gemma-class MoE ~26B (3.8B active) | 13.6 GB | 24 GB |
| ≥ 12 GiB | Gemma-class dense 12B | 7.1 GB | 16 GB |
| below | Qwen-class dense 4B | 2.5 GB | 8 GB |

  Larger tool-oriented models (~35B MoE at two quantizations, 17.7/22.1 GB, min 32/36 GB) are downloadable but never auto-recommended (they trade summarization faithfulness for agentic skill). Each model carries description, min-memory, and warmup metadata surfaced in the UI, with an amber warning when a model exceeds this machine's memory; a test must pin that the recommender never suggests a model the machine cannot hold.

#### Summarization (enhance) pipeline
- Pipeline: load session + transcript + template + participants → render system/user prompts (template engine) → stream with **temperature 0.2, topP 0.9, maxOutputTokens 32768, maxRetries 4** → validate the first 10–30 chars match the template's first section (≤ 2 retries) → normalize bullets → smooth-stream (250 ms, line granularity) → persist. Sampling must be explicit: llama.cpp defaults to temperature 0.8, which invents detail. Short structured tasks (titles, key facts) use temperature 0.
- **Thinking mode is opt-in** (setting default false): the server disables thinking globally; enhance re-enables per request. This scoping is load-bearing — title generation caps output at **128 tokens** and chat titles at **32**; a reasoning model would spend the whole budget thinking and return nothing. Reasoning text is displayed in a disclosure, never stored.
- While generating, render the **raw accumulating markdown with a streaming renderer — never into the rich-text editor** — with a block caret and a placeholder title slot; mount the editor only after generation succeeds AND the persisted row appears locally (persistence is async through the write queue; without the awaiting state the UI flashes an empty editor).
- Summary length policy from transcript size: **no summary below 160 normalized chars**; max chars = max(transcriptChars, 320) capped at **16,000**; section guidance steps every 2000 chars up to **12 sections**.
- Persisting a finished summary must: inject the session title as a leading `# Title` line, convert markdown → editor JSON, and write with **compare-and-swap SQL** (`UPDATE … WHERE body = <content read before generation>`, expect 1 row) retried under a lock-retry helper, checking an abort signal before each step — a user edit or concurrent regenerate silently wins over stale AI output.
- Generated titles: extract from the **last** non-empty output line; iteratively strip 'Title:'/'Final answer:' prefixes, list/heading markers, and symmetric wrappers to a fixpoint; reject empty, the literal `<EMPTY>`, and > 160 chars. Persist only when the stored title is still blank AND the user has no live title draft — **checked both before and after** the async snapshot load (the user can start typing during the await; single-check versions clobber input).
- Action-item rules in the system prompt: only explicit commitments, owner from the transcript speaker, no inferred deadlines, no invented owners.

> **Hard-won traps (LLM):**
> - `--sleep-idle-seconds 0` crashes the server at startup; floor at 30 s / map ≤ 0 → −1.
> - `/slots` & `/metrics` wake a sleeping model; poll process state instead.
> - Explicit temperature: the default 0.8 fabricates content on the one task where faithfulness matters.
> - Thinking must stay off for token-capped tasks (titles) or they return nothing.
> - CAS persistence + double title-draft check are the concurrency story against user edits.

---

### 3.4 Notes editor — difficulty 4/5

*(Standard ProseMirror plumbing, but dozens of interacting invariants that only reveal themselves as data corruption or lost edits.)*

#### Document model & persistence
- The note document is a ProseMirror-style JSON tree. Block nodes: paragraph, heading(1–6), blockquote, codeBlock (no marks), horizontalRule, bulletList/orderedList(start)/listItem, table/tableRow/tableCell/tableHeader (colspan/rowspan/colwidth), taskList/taskItem, image (block in the editor schema), fileAttachment, appLink, session, clip. Inline: text, hardBreak, a mention node. Marks: bold, italic, strike, code (excludes all others), link (inclusive:false), highlight (+ underline in the markdown-side schema). **Node and mark names are storage format** — persisted notes are stringified JSON; never rename after v1.
- Notes persist as stringified ProseMirror JSON in a `session_documents` row whose **id equals the sessionId** for kind='note'; summaries are separate rows (kind 'summary'/'template_output'). Rows imported as markdown are converted at **read** time, never rewritten in place (a failed conversion must not destroy the import).
- Edits debounce persistence by **500 ms**, flush synchronously on editor disposal (tab switch loses the last < 500 ms otherwise), and expose an explicit flush used before share/publish.
- All DB writes for a session serialize through an in-process async write queue keyed `session:{id}`; each write chains with error-swallowing so one failure doesn't stall the queue; flush loops until tails drain (new writes can arrive while awaiting).
- Session title derives from the doc: trimmed text of the first block; empty first block with other text ⇒ ""; whole-doc empty ⇒ **null, and the title column must not be updated** unless the stored note previously had content (the null-vs-empty distinction prevents a freshly opened note from clobbering a concurrently arriving AI title).
- The first line is enforced as an H1 title (append-transaction plugin + load normalizer; an empty-H1-only doc gets a trailing empty paragraph so the body is clickable). Loading merges the stored title into content by exact rules (equal text → retype as heading; empty first H1 → replace; else prepend) — mis-ordering duplicates titles on every load. A summary editor must skip persistence entirely when stored content is "" and the doc is exactly the canonical empty document (title-only H1 + one empty paragraph) — otherwise merely opening an empty summary writes a fake note.

#### Cross-window/state sync
- External content changes (other windows, sync, AI) apply by **replacing editor state**, only when: JSON differs, no IME composition is active, and the editor is unfocused (or an explicit sync-while-focused flag). If a composition is active or ended < **500 ms** ago, retry after the remainder — replacing state mid-composition corrupts CJK input.
- Before applying external content, cancel the pending autosave debounce; the doc-change listener must fire only for transaction-driven changes (plugin state initialized false, flipped by tr.docChanged) so a full state replacement is silently ignored — this is the echo-loop breaker; without it windows ping-pong updates forever.
- Cross-window propagation rides SQLite live queries: dependent tables derived from the SQL, change events broadcast, batches coalesced, and a **lagged broadcast receiver must degrade to re-running all subscriptions** rather than dropping updates (eventual consistency under write storms).
- Read-only mode must use a transaction filter rejecting any doc-changing transaction — contentEditable alone does not stop node views (checkboxes, resize handles) from dispatching.

#### Markdown dialect (lossless round-trip)
- Serialization: bold `**`, italic `*`, strike `~~`, highlight `==`, underline `<u>`, code fences one backtick longer than the longest run inside, links with `(`/`)` escaped in href, hard breaks as backslash-newline (trailing runs dropped), right-aligned ordered-list numbering, `---` rules. Bold/italic/strike must expel enclosing whitespace or `**bold **text` round-trips broken.
- **Empty paragraphs must survive round-trip:** count blank lines via parser token line-maps and emit one explicit empty paragraph per extra blank line (between blocks = gap−1; leading/trailing = full gap); serialize an empty paragraph as a forced extra blank line. Markdown collapses blank lines — without this every save/load deletes intentional spacing.
- Images are inline in markdown but blocks in the editor: lift image-only paragraphs to top-level blocks on parse; wrap back on serialize. Image display width round-trips through the markdown **title** field as `<width-prefix>=NN` or `<width-prefix>=NN|actual title`, integer percent clamped [15,100], default 80 (markdown has no width syntax; strip the prefix when displaying the real title).
- File attachments serialize as a whole-line plain link `[name](asset://localhost/…)`; the parser matches only when the line starts with `[`, the URL starts exactly with the asset prefix, **parentheses are balanced by scan (not regex)**, and only whitespace follows — the balanced scan stops one attachment from swallowing a second link's tail.
- Attachment portability: before persisting, nodes carrying an attachmentId must drop local `src`/`path` attrs; a render-time resolver maps attachmentId → current local path (absolute paths break when the notes folder moves to another machine).
- Mentions serialize as `<mention data-id data-type data-label></mention>` with **exact attribute order** (storage format); arrow keys skip over mention atoms. Task items carry (status: todo|in_progress|done, checked, taskId, taskItemId); a plugin assigns fresh UUIDs to missing/blank/**duplicate** ids in document order (copy-paste and splits duplicate them; first occurrence keeps identity). Markdown round-trip preserves only `[x]`/`[ ]`; a bullet list becomes a task list when any item matches the checkbox prefix, converting the whole list.
- Tables flatten rowspan/colspan into GitHub pipe tables (empty cells for spans, rows padded to max width); cell newlines become literal `<br>` with pre-existing literal `<br>` text escaped via a placeholder dance (a user typing `<br>` must be distinguishable from a real break); `|` escaped.
- YouTube paste (watch/shorts/embed/youtu.be URLs, iframe snippets) inserts an atom clip block normalized to the embed URL preserving clip/start params; `youtube.com/clip/` links resolve **asynchronously** (fetch the page, regex the videoId; insert when resolved — the id is not in the URL).

#### Comments (quote anchoring)
- Comment anchors are **quote-based, never position-based**: store {quoteExact, 64-char prefix/suffix, position hints, snapshotRevision} from a text projection where each block boundary contributes exactly one `\n` and every non-text leaf contributes U+FFFC; return null (hide comment UI) for selections with no anchorable text or > 1024 chars; trim boundary separators **by position, not by character** (real newlines inside code blocks must survive).
- Resolution trusts position hints only when snapshotRevision matches AND the hinted slice still equals the quote; otherwise search all occurrences and score by common prefix/suffix context length; **a tie resolves to null — never guess** (highlighting the wrong duplicate is worse than none). The live editor passes revision −1 to permanently disable the hint fast path.
- Once pushed into the editor, anchors live in a plugin keyed by transaction metadata; on every doc change canonical ranges are remapped through the transaction mapping and dropped when from ≥ to; decorations are render artifacts — **never derive ranges back from decorations** (they fragment when edits split a range).

#### Editing behaviors
- Autolink runs over changed textblock ranges only, matching http(s)/www./bare-domain candidates, trimming trailing punctuation and any closing bracket **unbalanced within the candidate** (keeps `wiki/Foo_(bar)` intact, drops the paren in `(see https://x.com)`).
- A link-boundary guard keeps marks consistent while editing link text: no-longer-a-URL removes the mark; still-a-URL rewrites href; typing immediately after a link whose text mirrors its href extends mark+href up to whitespace — unless the run is only standalone punctuation.
- Enter into a new empty paragraph clears stored **bold and italic only** (code/link/strike/highlight continue).
- Markdown input rules as-you-type (#×N+space→heading, >, lists, N., ```, ---, [ ]/[x], →, ©, **/*/_/~~) must account for the final typed delimiter **not yet being in the document** (delete delimLen−1 trailing chars) and remove the stored mark after applying.
- Keymap: Enter chain (exit codeBlock on trailing empty line → newline-in-code → lift empty list item → split list item → paragraph-near → lift → split); Backspace chain includes a deliberate **swallow at doc position 0** (protects the enforced H1) and task-item backward join; **Tab always returns true** (never escapes the editor); Alt-Arrow reorders list items; standard macOS Ctrl bindings.
- Click below the last block (or left-mousedown in the note pane outside interactive elements) focuses a trailing empty paragraph, creating one if needed (Notion-style dead space).
- Plain-text clipboard copy separates blocks with exactly one blank line and renders images as their markdown form.
- Cross-field caret navigation between the title input and editor preserves the caret's **horizontal pixel position** measured with a canvas text-metrics pass (title and body render at different font sizes; character-index mapping is wrong).
- Every custom node view is wrapped in a per-node error boundary falling back to a plain tag (one corrupt node view must not unmount the editor); node views resolve positions via a guarded getPos that returns null after teardown.
- Image resize handles use local draft state during drag (clamped ≥ 120 px), persisting a **percent of container width** (15–100) only on pointer-up — per-move transactions would spam undo history and autosave.
- All content loading is defensive: invalid JSON → canonical empty doc; markdown parse failure → a single paragraph containing the entire raw text (preserve the user's bytes); serialize failure → "".
- Hashtags decorate (not mark) `#word` tokens in changed ranges, except when the `#` is part of a URL fragment (look back at the preceding token).
- The view switcher (raw note / summaries / transcript) keys each editor instance by view identity so switching **remounts** a fresh editor — reusing one editor leaks undo history and plugin state across documents.
- Pasted-HTML bold must implement the Google-Docs quirks: accept `<strong>`/`<b>` unless font-weight:normal, **clear** bold on font-weight 400, accept `bold|bolder|500–900` (Google Docs wraps documents in `<b style="font-weight:normal">`; without the clear rule pasted docs turn bold). Link clicks are DOM-intercepted, validated http/https only, and routed to the external browser (an unhandled webview click navigates the app window itself).
- A single dragged/pasted **audio** file is intercepted before generic attachment handling and routed to the transcription-import flow; detect audio by MIME with DataTransfer item type as fallback (File.type is often empty during OS drags); use a depth counter for drag-enter/leave (dragleave fires for every child) and bring the window to front on drag-enter.
- Accepted image types (png/jpeg/gif/webp) insert image nodes; other files insert attachment blocks; uploads are hashed (SHA-256), saved, and cataloged — **catalog failure rolls back the saved file**.

> **Hard-won traps (editor):**
> - Node names are storage format; empty-paragraph line-map bookkeeping; width smuggled through the image title.
> - IME grace window (500 ms) + transaction-only change listener = the cross-window echo breaker.
> - Quote-anchor tie → null; separator trim by position; anchors remapped via tr.mapping, never decorations.
> - CAS summary persistence racing user edits; double title-draft check around an await.
> - Balanced-paren attachment parsing (regression test: two links on one line).

---

### 3.5 Data model & storage — difficulty 3/5 (rated within other subsystems)

- **SQLite is the canonical store.** Schema and migrations live on the native side; the UI consumes execute/subscribe APIs only. A typed schema mirror on the TS side is generated/maintained, never authoritative.
- Core tables: `sessions` (kind default 'meeting', event linkage columns + denormalized `event_json` snapshot, folder, status, times), `session_documents` (kinds note/summary/template_output; body_format prosemirror_json|markdown), `transcripts` (words_json, speaker_hints_json, provider/model, audio link), `session_participants` (→ humans, source auto|manual|excluded), `session_attachments`, `action_items`, `humans`, `organizations`, `tags`/`session_tags`, `entity_mentions`, `chat_groups`/`chat_messages`, `templates`, `calendars`/`events`, `workspaces`/`workspace_memberships`, `app_settings` (key/value JSON). Supporting tables: E2EE records/state/witness, share caches, attachment transfer jobs, search-index dirty queues.
- Soft deletes (`deleted_at`) throughout; upserts resurrect (`deleted_at=NULL`).
- **Vault filesystem:** `sessions/{id}/audio.{mp3,wav,ogg}` plus attachments per session. The vault base path is user-configurable; changing it copies the vault **before** switching the base path, then schedules an app relaunch (deferred during onboarding with an explanatory dialog).
- Settings: one row per key in `app_settings` (id = key, value_json, updated_at ISO-8601), upserted, all writes serialized through a single settings write queue. Type-mismatched values read as absent. (A greenfield build needs no legacy-snapshot fallback chain, but must keep the one-row-per-key + JSON-scalar shape.)
- Full-text search over notes/transcripts via an embedded index (e.g. Tantivy) fed by dirty-queue migrations; search must work fully offline.
- Concurrency rules that repeat across subsystems: per-entity async write queues; SQL compare-and-swap (`UPDATE … WHERE value_json = <previously read>`, retried up to 5 attempts) for settings/JSON blobs written by multiple windows; database-lock retry helpers around all capture-time writes.

---

### 3.6 Calendar & meeting detection — difficulty 5/5

*(Three OS-native integrations — CoreAudio listeners + process introspection, EventKit with singleton/XPC quirks, AX-tree scraping with safety invariants — plus a diff engine and a dense web of tuned timers where nearly every constant encodes a fixed field bug.)*

#### Calendar providers & sync
- Exactly three providers: Apple (EventKit, macOS only, free), Google, Outlook (both via the cloud API proxying provider OAuth held server-side; the desktop sends only a bearer token + connection id). Availability is a map where **an empty connection list means "available but not connected" and an absent provider means "unavailable on this platform"** — the UI renders connect vs hidden from this distinction.
- Google fetches must use single-event expansion (recurrences expanded server-side) and default event types (drop birthdays/OOO); Outlook must use the calendar-view endpoint (not /events) or recurring occurrences go missing. Desktop HTTP: connect 10 s, request 30 s. When listing remote connections fails, sync continues with local providers only (warning; debug-level when the API host is localhost).
- Sync runs on a **60 s** schedule AND re-triggers immediately on the OS calendar-change notification (observed on a dedicated parked thread, forwarded to the UI). Runs serialize through a promise tail with 250 ms minimum spacing, honor an abort signal, and set an explicit max duration of **120 s** with retries (a task scheduler that kills long runs at a 1 s default and permanently stops a timed-out repeating task must be configured per-task).
- Default sync window: **[local midnight − 6 days, local midnight + 2 days)**. The diff must also load out-of-window rows whose tracking id appears in the incoming set so moved events resurrect instead of duplicating.
- **Exactly one EventKit store instance process-wide** (lazy singleton). All EventKit calls that can raise ObjC exceptions are caught and mapped to a retryable XPC error, retried 3× with 100 ms constant backoff. Only FullAccess counts as authorized; the access-request completion is awaited with a 60 s timeout defaulting to denied. (Reproducible bug: multiple concurrent stores make calendar listing intermittently return empty.)
- Apple recurring events get per-occurrence tracking id `{eventIdentifier}:{YYYY-MM-DD}` with the date rendered **in the event's own timezone** (EventKit returns the same identifier for every occurrence; UTC dates flip across midnight for other timezones). Series id = external identifier fallback item identifier; Google uses recurringEventId, Outlook seriesMasterId.
- Events the current user declined are skipped at fetch time. Meeting-link resolution: provider-native link first; else regex extraction from description then location, **specific patterns before the generic URL fallback**: Google Meet `https://meet\.google\.com/[a-z0-9]{3,4}-[a-z0-9]{3,4}-[a-z0-9]{3,4}`, Zoom `https://[a-z0-9.-]+\.zoom\.us/j/\d+(\?pwd=…)?` (the pwd param must be kept — join fails without it), cal.com video, then first generic URL.
- New calendars insert **disabled** (opt-in); upserts preserve a live calendar's enabled flag; resurrected calendars reset to disabled. Calendars missing from a **successful** refresh of their connection are soft-deleted with their events in one transaction (never prune on a failed refresh — a transient API failure would mass-delete). Disabling soft-deletes events; enabling triggers resync.
- Event diff key: (local calendar row id, provider tracking id); matched rows update in place preserving row id/created_at; unmatched in-window live rows soft-delete; unmatched incoming insert.
- Sessions embed a denormalized `event_json` snapshot ({tracking_id, calendar_id, title, started_at, ended_at, is_all_day, has_recurrence_rules, location, meeting_link, description, recurrence_series_id}); every sync refreshes it for matching sessions — countdown/auto-stop logic must keep working after the events row is soft-deleted.
- Participants sync to a humans table keyed by lowercase-trimmed email; mappings with source='auto' are deleted when a person leaves the event; **manual/excluded mappings are never touched by sync**. Organizer first, deduped case-insensitively; role 'nonparticipant' and email-less attendees skipped.
- get-or-create-session-for-event must be race-safe: lookup by event linkage, INSERT guarded by WHERE NOT EXISTS of the same predicate, then re-select preferring the just-inserted id — notification click, calendar chip, and countdown can fire near-simultaneously.
- Disconnecting an integration tombstones its calendars/events, blocklists the connection in memory, and bumps a sync generation counter checked between every async step so in-flight runs abort.

#### Notifications & auto-start
- Upcoming-event notifications: 30 s poll; notify when 0 < (start − now) ≤ **5 min**; per-(eventId, startMs) dedup with 10 min TTL (a rescheduled event re-notifies); persistent (no timeout); message "Starting in N minute(s)". Clicking opens/creates the session and auto-starts recording **only if started_at ≤ now at click time** (users click early to prep notes); mic-detection notifications always auto-start on accept.
- Auto-start countdown: events starting within **5 min** show a ticking label; expiry fires exactly once and **only if the countdown was actually displayed before reaching zero** (armed flag) — otherwise every stale meeting note auto-starts on open. With auto-join enabled and a meeting link present, open the link and start recording concurrently. The consuming effect waits until a live session can start AND the STT connection is ready, attempts once per mount, then clears the flag; ignored in popped-out windows.
- Sidebar upcoming pill: nearest non-all-day item within 5 min ('In Nm Ss', progress = diff/5 min) or in-progress item ('Now', earliest end wins); recompute on a 1 s tick with timestamps floored to the second, on window focus, and on visibility change, emitting only on structural change (prevents 60 re-renders/s; fixes the frozen countdown after lid reopen).

#### Mic-usage detection (macOS)
- Detection must be event-driven: a CoreAudio property listener on device-is-running-somewhere of the default input, plus a default-input-change listener that re-attaches the device listener (plugging in AirPods otherwise silently kills detection), plus initial-state seeding at startup (app launched mid-meeting). Transitions debounce 500 ms.
- While the mic is in use, a 1 s poll diffs the set of mic-using apps and emits per-app started/stopped events. A mic-on transition with an empty/failed app snapshot must NOT emit (snapshot transiently fails at mic-on; keep previous app state on error so the eventual stopped event carries the right apps).
- Mic-using apps resolve from CoreAudio process objects: pid → running-application bundle URL → **outermost** .app bundle (helpers live in nested bundles; innermost shows "zoom.us Helper (Renderer)"); fallback executable-path bundle walk; then bundle-id/exe/pid identity. Apple call daemons (avconferenced, TelephonyUtilities…) relabel to "FaceTime"/"iPhone Call". Wrap the lookup in panic-catching (throws on zombie pids).
- "You're in a meeting" fires only after an app holds the mic continuously for the threshold (default **15 s**, options 5/10/15/30/60/120), implemented as per-app cancellable timers keyed by a generation number (a stale timer must not claim a newer tracking round). After firing: **10-minute cooldown** per app (push-to-talk spam). At fire time re-check the enabled setting (read fresh from disk, not cache) and Do-Not-Disturb.
- Ship a **default ignore list** of mic-using non-meeting apps: the app itself, dictation tools (Wispr Flow, superwhisper, VoiceInk, MacWhisper, Aqua Voice, Apple Voice Memos, …), IDEs/terminals (Warp, VS Code, Cursor — bundle id `com.todesktop.230313mzl4w4u92`, Windsurf), screen recorders (~16 ids: OBS, Loom, CleanShot, Screen Studio, Kap, ScreenFlow, Camtasia, Snagit, QuickTime, …), AI assistants (ChatGPT, Claude), misc (Raycast, GarageBand). Precedence: user-ignored > user-included > category default; unknown apps are tracked. Starting from an empty list will spam users; the list is accumulated field experience.
- If a recording is already active (or a start is in flight), a detection event is swallowed and its app ids merge into the live session's trigger apps; this check must **re-run after async notification prep**, right before showing (otherwise a notification appears for the meeting just started).
- The detection notification personalizes from calendar context: non-all-day events within **±15 min** of now; 1 non-self participant → "Are you talking to NAME right now?"; 2 → "…A and B…"; more → "Are you in TITLE right now?"; else generic. Auto-dismiss 15 s; one prompt in flight at a time; footer "Ignore X?" appends to the ignored list.
- When a browser is among detected apps and a nearby event exists (and no known native meeting app is also detected), display the platform inferred from the event — checking meetingLink, location, description, title in that order against a hostname table (zoom.us, meet.google.com, webex, teams, cal.video, daily.co, whereby, jitsi, goto, slack, discord, whatsapp, telegram, signal, line, messenger, …) then keyword fallbacks. Field priority + native-app-wins prevents labeling a Zoom call "Google Meet" because the invite also had a Meet link. Maintain a ~33-entry browser bundle-id set (Chrome/Edge/Firefox/Brave/Opera variants, Arc, Dia, Zen, Vivaldi, Tor, …).
- Display names are overridden by a normalized-name-first, bundle-id-second table (zoom helper → Zoom; avconferenced → iPhone Call; Teams/Webex/Slack/Kakao/WhatsApp/Discord/Signal/Telegram/LINE/Messenger ids) — helper names leak otherwise.

#### Auto-stop
- On mic release (setting default on): candidates = stopped apps ∩ session trigger apps, or all trigger apps when none of the stopped apps were triggers (then require a fresh mic snapshot at confirm). Schedule a confirm **5 s** later; clamp all timer delays to [0, 2³¹−1] ms (setTimeout overflow fires immediately; event-end deadlines can be > 24 days). A pending confirm not requiring a snapshot must not be replaced by a weaker one requiring one. Unreliable apps (e.g. KakaoTalk, which toggles its mic handle mid-call) can neither trigger a stop nor be trusted as evidence — but re-acquiring the mic vetoes the stop.
- Confirmation re-validates everything at fire time (pending still current, listener on the same session, candidates still triggers) then takes a **fresh mic snapshot** — if any candidate or unreliable trigger still holds the mic, do nothing. If the snapshot RPC fails and a snapshot was required (or an unreliable app is involved): do nothing. **Never stop on missing evidence.**
- Network-interruption grace: if offline at confirm time (or went offline while pending) and the session links to a timed event, do not stop before **event_end + 10 min** (reschedule the confirm to that deadline); skip for all-day events and when now < start − 5 min. Browser tabs drop the mic on Wi-Fi blips; stopping then loses the rest of the meeting.
- Early-end prompt: when candidates include a browser and the linked timed event has ≥ **3 min** remaining (and now ≥ start − 5 min), don't stop silently — show "Did your meeting end? / will stop listening in 30 seconds" with a destructive Stop action and 30 s timeout; accept/timeout stops, body click keeps recording. Native-app-triggered stops skip the prompt (native apps release the mic reliably at call end).
- System sleep must immediately clear pending auto-stops and stop the live recording; wake does not auto-resume.
- Zoom mute mirroring (for the mute indicator): poll Zoom's AX menu bar every 1 s while Zoom holds the mic ('Mute Audio' present → unmuted, 'Unmute Audio' → muted); requires Accessibility trust; cleared when Zoom releases the mic.
- Ignored events store as two JSON lists (per-occurrence tracking ids and recurring-series ids) with optimistic-CAS writes retried 5×, plus a token-versioned optimistic UI override held for **1000 ms** after the write settles (rapid toggling otherwise flashes stale state through the async live-query pipeline).

#### Tray agenda & AX safety
- The frontend publishes a 7-day horizon of non-all-day, non-ignored, unended events with **precomputed timezone-aware day-start boundaries**, so the native side labels Today/Tomorrow with pure float comparisons (no tz database in native code; 'Tomorrow' flips at local midnight).
- Menu-bar title: in-progress event 'Title • Xh Ym left' (earliest end wins) else next event within 24 h 'Title • in Xm'; whole label ≤ 30 chars; dropdown lists ≤ 3 items grouped Today/Tomorrow, each ≤ 24 chars; duration text < 60 s 'Ns', < 60 m 'Nm', else 'Xh[ Ym]'.
- AX-tree introspection (meeting-app helpers): cap walks at **depth 18 and 1800 nodes**; set per-app AX messaging timeout to **0.6 s** (uncapped traversal of Electron apps beachballs them); participant video tiles require area ≥ 18,000 px²; chat messages ≤ 2000 chars.
- AX chat capture/send must be paranoid: intersect caller-supplied bundle ids with a **fresh** mic-using snapshot; require exactly one recognized meeting bundle, exactly one validated visible chat surface; Slack Huddle send refuses on multiple windows, multiple Slack instances, non-empty existing draft, composer content changed between set and send, or an ambiguous send button — restoring the original composer text on failure. Only Slack Huddle send is enabled; all other AX chat mutation stays hard-disabled until window↔composer pairing is provably safe. (This posture is accumulated defense against sending a private message to the wrong channel.)
- Windows mic detection may ship as a stub; Linux uses PulseAudio source-output subscription with 500 ms debounce.

> **Hard-won traps (calendar/detect):**
> - EventKit singleton + XPC retry (multiple stores ⇒ intermittently empty calendar lists).
> - Per-occurrence tracking ids dated in the event's own timezone.
> - Only prune calendars on a successful refresh of that connection.
> - Armed-countdown guard; generation-keyed detection timers; cooldown vs cancel distinction.
> - Fail-safe auto-stop (never stop on missing evidence) + offline grace + browser early-end prompt.
> - setTimeout 2³¹−1 clamp; Cursor's unguessable bundle id in the ignore list.

---

### 3.7 Sync & sharing (E2EE) — difficulty 5/5

*(A from-scratch E2EE sync protocol — blinded field records, per-field AEAD with context binding, an anti-rollback freshness witness, and a 7-phase crash-safe poison-recovery machine — plus a CAS-based plaintext sharing system. Nearly every constant encodes a fixed bug or a security property.)*

#### Key material
- Recovery key: 32 random bytes presented as `meeki-e2ee-v1:` + base64url-no-pad. Parsing trims whitespace, requires the exact prefix (which doubles as the version tag), rejects non-32-byte decodes.
- Key id: base64url-no-pad of the first 16 bytes of SHA256(`meeki-e2ee-recovery-key-id-v1` ‖ key) — exactly 22 chars, validated by regex `[A-Za-z0-9_-]{22}` on **both** client and server; a malformed key-id header must 400, never silently downgrade. The key itself never leaves the device; it lives in the OS secret store (scope `e2ee`, name `account:{uuid}:recovery-v1`, 25 s read timeout) and create/import **refuses if a key already exists** (protects the only copy that decrypts existing data).
- Per-workspace data key = HKDF-SHA256(salt=`meeki-e2ee-workspace-key-v1`, ikm=recovery key, info=workspace_id). The personal workspace id **equals the account user id** — this invariant is load-bearing for key derivation, write filters, and share resolution, and must be validated in both client and server projection checks.

#### Encrypted field records
- Each synced cell is a separate record with a **blinded id**: base64url(HMAC-SHA256(workspace_key, len64be-prefixed(`meeki-e2ee-field-id-v1`, table, row_id, field))). Every component is length-prefixed with u64 big-endian before the HMAC update — raw concatenation creates colliding ids ('ab'+'c' vs 'a'+'bc'). The server never sees table names, row ids, or column names.
- Payload sealing: plaintext JSON {table, row_id, field, writer_id, revision, deleted, value} encrypted with **XChaCha20-Poly1305** (24-byte random nonce), AAD = len64be-prefixed(`meeki-e2ee-payload-v1`, workspace_id, record_id, key_id); envelope JSON {version:1, key_id, nonce, ciphertext}. Context binding makes cross-workspace/cross-record payload swaps fail closed (test this explicitly).
- After AEAD success, the opener must **recompute the blinded id from the decrypted plaintext** and reject on mismatch — AEAD alone doesn't stop a malicious server from serving a valid record under a different valid id.
- Writer id: one 32-char lowercase-hex id per device, persisted locally; seal rejects malformed ids; decode accepts missing/empty (legacy) but rejects malformed non-empty ones.
- Value tags for local-change detection: HMAC-SHA256(workspace_key, len-prefixed(`meeki-e2ee-value-tag-v1`, table, row_id, field) ‖ deleted_byte ‖ canonical_json(value)) — lets the applier answer "did the user edit this field since last sync?" without keeping plaintext baselines.
- Exactly **8 domain tables are field-encrypted**: action_items, humans, organizations, session_attachments, session_documents, session_participants, sessions, transcripts. All plaintext domain tables are registered with the sync transport but **transport-disabled**; only the encrypted-records table syncs. Forgetting the disabled flag ships plaintext to the server.
- Row manifest: every row has a synthetic field `$row` (true, or deleted:true tombstone). Rows materialize/delete on a replica **only via the manifest**; per-column tombstones, fields named id/workspace_id, and unknown columns (validated against live table info) are rejected.

#### Convergence & anti-rollback
- Outbound revision = max(previous local revision, witnessed revision) + 1 (taking the max against the witness prevents a device that missed updates from publishing a stale revision that loses to its own old data); unchanged fields (same value tag) skip unless forced (row recreation after tombstone; manifest bump on any field change).
- Conflict order is the lexicographic tuple **(revision, writer_id, payload_hash)** — total even for equal (revision, writer), so devices converge without a coordinator. Inbound records strictly less than local state are rejected as rollbacks and the local payload is **written back** into the replica (actively repairs a poisoned replica; fail with RollbackDetected when the saved local payload is empty or hash-mismatched).
- Local-edit protection: if a row's manifest changed remotely but any local field's value tag differs from its baseline, skip the whole row group — local edits win until the local encrypt pass republishes at a higher revision.
- Apply batching: preflight pages 64 records by (workspace, id) cursor; a pass applies ≤ 16 row-groups and ≤ 16 MiB (per-record bytes + 256 overhead); one row-group > 16 MiB is a hard error; leftover work immediately re-requests reconciliation. Each row group commits in its own immediate transaction with cooperative cancellation between statements (so a 2 s activity-lease drain deadline can always be met).
- **Freshness witness:** an append-only per-workspace server log of (sequence, record_id, payload_hash, payload). After a completed snapshot, any replica record whose exact payload is absent from the local witness mirror is rejected as unwitnessed — the anti-rollback backstop against a malicious/buggy server serving an old-but-valid record. The requirement is waived only while a full-resync snapshot is hydrating (or a fresh device could never bootstrap). The witness mirror upserts keep only the max version per record using the **same total order as the applier** (divergence makes records ping-pong forever). Witness transport: server publish ≤ 64 events/batch, event ≤ 16 MiB, read page 1024, page cap 48 MiB; client publish ≤ 16 events / ≤ 48 MiB, honors 429 Retry-After (default 30 s, cap 60 s, max 3 retries), request timeout 120 s. Pending witness uploads are **derived** (re-computed from a version comparison after every upsert), never an imperative queue — derived queues self-heal after crashes.

#### Transport & credentials
- Token exchange requires Pro entitlement (403 otherwise); optional device-slot claim from a fingerprint header (8–128 chars [A-Za-z0-9_-]; invalid fingerprints are logged and skipped, never rejected — old clients don't send one; limit exceeded → 403 `sync_device_limit_reached`); then E2EE key-id claim (first-writer-wins; different already-claimed key → 409); then mint a scoped sync token (workspace-id attributes ≤ 128 workspaces, TTL default 900 s bounded 60–3600, Cache-Control no-store). Ordering matters: device claim → key claim → token mint, so a device-limit denial never burns a key claim. A token request without the E2EE header returns HTTP **426** (desktop-upgrade-required) in enforced modes.
- Client credential lifecycle: refresh 2 min before expiry; on failure retry every 60 s; while an activity lease is held re-poll in 5 s; min reschedule 1 s; whole exchange bounded 25 s; teardown 2 s. Missing recovery key → block with 'setup_required' and suspend (no retry loop). **Every await is guarded by a generation counter** — stale continuations return silently, or sign-out/sign-in races reconfigure sync with the wrong account.
- Sync loop: default interval 30 s; manual requests during a run retry at 200 ms; transient errors back off exponentially (min = interval, max 300 s, jittered); non-transient errors stop the loop. local-work-remaining shortens the next delay so multi-page applies drain without hot-looping.
- Outbound preflight: refuse to send unless the pending batch fits ≤ 8 chunks / ≤ 4096 rows / ≤ 32 MiB, ends with a final chunk, and all chunks agree on one watermark version (inconsistent watermarks are hard errors; extension chunk cap 5 MiB). After an ambiguous confirmation, advance the send cursor only when: chunks existed, watermark > start, batch complete & fits, server status shows no gaps and no apply failure, and **both** optimistic and confirmed server versions ≥ watermark; re-read the cursor in a transaction and abort if it moved. (This guard set exists because a crash between upload and cursor write re-sends forever.)
- Server status parsing must tolerate multiple gateway shapes (object or {data} envelope; null gaps → []; missing optimistic version defaults to confirmed — a conservative lower bound).
- **Receive-only cursor reset:** to force a full re-download without losing unsent local writes, set only the two receive cursors to 0 inside a transaction, verifying the two send cursors are unchanged. (A vendored sync extension's public reset API zeroed all four cursors — which silently discards queued local writes. Guard against this class of bug.)
- Native HTTP made by the sync layer must honor connect/total deadlines from configuration; a hung server must fail transient within ~2× the timeout and must not block database shutdown (run terminate hooks on pooled connections before close). Test with a black-hole server.
- Write filter: a transport-level filter restricting outbound rows to the personal workspace (`workspace_id IN (SELECT … FROM writable-workspaces table)` with exactly one row); shared-workspace membership is **receive-only** at the transport.

#### Pause/lease + recovery
- Activity leases pause sync during capture/enhance/transcription: a lease is an (activity, key) pair; sync pauses while any lease exists. Acquiring must serialize on a mutex, be idempotent, register the lease, then **drain any in-flight sync** by interrupting every 25 ms until idle, bounded by a **2 s** drain timeout (rollback + distinct DrainTimeout error on expiry). The guarantee callers rely on: after acquire returns Ok, no sync I/O touches the DB. Every sync phase re-checks pausedness between steps; hooks race the operation against a pause-wait, and on pause must **cancel then await the operation to completion** — dropping the future mid-transaction leaves an immediate-mode write lock held against the capture path. Releasing the last lease notifies waiters and requests a sync immediately; failed releases retry at 100 ms then 300 ms, then hand off to a background retry every 5 s **forever** (a leaked lease pauses sync permanently). Control-plane ops (configure, token install, resync) refuse while a lease is held and double-check after acquiring the control mutex.
- Outbound encryption must defer rows belonging to sessions with an active capture-lifecycle marker (strict JSON field-type validation; a corrupt marker fails **open to 'active'** and defers — never publish a half-written session). Encrypt passes bounded to 64 dirty rows. The capture lease is **handed off (not released)** when crash recovery is pending, so sync never uploads a half-written transcript.
- Workspace claim at first sign-in: scan all E2EE-domain rows (batches of 128) and **reject if any row carries a foreign workspace id** before rewriting anything (claiming a DB containing another user's synced data would exfiltrate it into the new account); then rewrite workspace/user-id columns (including the legacy all-zeros UUID) to the account id in batches; persist the binding; a binding claimed by another account fails with AccountMismatch.
- Workspace projection (workspaces + memberships) is server-authoritative: fully deleted and rewritten in batches of 128 in one immediate transaction — never merged (merging lets a revoked membership keep decrypting new data). Any grant or revoke forces a full resync; revoked workspaces queue their sessions for eviction (retried every 30 s).
- While a full resync is pending, the before-sync hook returns **ReceiveOnly** (no outbound publication) — publishing local encrypted rows while hydrating a clean snapshot re-poisons the replica being rebuilt (this exact bug motivated the recovery machinery).
- **Poison recovery is a 7-phase persisted state machine** (protocol v1): NeedFirstLogout → NeedBarrierInsert → NeedBarrierConfirm → NeedCleanReceive → NeedWitnessRepair → NeedBarrierCleanup → NeedTransportResume. Phase advancement is CAS on (generation, expected phase, stored-JSON equality) inside an immediate transaction; every phase is re-entrant and idempotent (the driver may be killed at any await); state survives restart.
- The recovery **barrier** is an encrypted control record under a synthetic table name, row_id = generation, field `$snapshot_barrier`, value {protocol_version, generation, random nonce}; inserted locally, pushed, and the clean receive is ready only when the barrier round-trips **byte-exact** from the server — the freshness proof that defeats a pre-poisoning backup or replayed older barrier. Clean receive: verify replica disposable → logout(discard) → reset receive cursors → verify empty → receive page-by-page, refreshing the witness and applying with the witness requirement waived; progress cadence 200 ms after productive steps, 5 s retry when waiting, surface 'delayed' after 60 s without progress. Witness repair afterwards re-derives/publishes witness entries (64 records / 16 MiB per pass) before outbound resumes.

#### Sharing (deliberately plaintext, explicit publish)
- Access model: general scope ∈ {restricted, workspace, link, public}; per-user capabilities ∈ {viewer, commenter, editor}; grants, expiring invitations, and pending requests; every mutation returns a monotonically increasing access_version. Access list ≤ 1000 rows / ≤ 1 MiB response.
- Token formats: share/invitation ids are UUIDv4 (regex-validated); public slugs `^s_[0-9a-f]{32}$`; link/invite capability tokens `^[A-Za-z0-9_-]{43}$` (32 random bytes base64url). Capability tokens ride in the **URL fragment** (`#token=…`), never the query string — keeps them out of server logs, referrers, and CDN caches.
- Shared snapshots are **not E2EE** (publishing deliberately exits encryption): the owner publishes sanitized plaintext {title, doc body, attachment manifest}. Limits enforced identically in desktop, API, and web editor: body ≤ 2 MiB, title ≤ 4096 bytes, doc depth ≤ 64, nodes ≤ 50,000, ≤ 64 attachments each ≤ 512 MiB with sha256 (depth/node budgets prevent hostile-document DoS of validator and viewers).
- Snapshot publish is CAS with **deterministic mutation ids**: UUIDv4 derived from SHA256(`meeki-session-share-mutation-v1\0` + shareId + baseRevision + sourceHash + canonical attachment ids) with version/variant bits forced — retries are idempotent across process restarts without a client outbox. Revision conflicts return the current snapshot (typed conflict error), not a bare failure.
- Owner auto-publish: a live query joins owned shares to sources; publish fires only when acknowledged revision matches the durable snapshot, no conflict, no pending web-edit base; debounce **800 ms**; record baseline source hash = SHA-256 of **canonical JSON (sorted keys, undefined stripped)** — naive stringify breaks hash equality across serializers.
- Web-edit import reconciliation is a state machine over (snapshotHash, projectionHash, baselineSourceHash, contentRevision) → ignored | deferred | idle | local_pending | assessment_required | imported | conflict; import allowed only when local projection equals the recorded baseline; diverged → conflict (manual resolution); acknowledged revision must never move backwards; a regressed revision or changed hash at the same revision must throw (server tampering or cache corruption, not a mergeable state).
- Import writes are guarded three ways: defer when a canonical editor is active (mounted, pending activation, focused tab, or a note window exists — **window-enumeration failure counts as active**); acquire a session import lock; apply title/body via UPDATEs asserting previous values (1 row expected); re-check editor activity after commit and downgrade to conflict if one appeared.
- Recipient sync: authenticated clients poll shared-with-me snapshots every 60 s, 8 rows/page, ≤ 64 MiB aggregate/refresh; a durable local cache (≤ 5000 notes) is the offline story for received shares.
- Anonymous web→desktop handoff: the web viewer requests a one-time {requestId, expiresAt} bound server-side to HMAC-SHA256(service key, domain-string + client IP) — a leaked requestId is useless from another network and no IP is persisted; the desktop claims with a **client-generated leaseId** (idempotent re-claims) and downloads attachments during the lease.
- Shared attachments: signed download URLs expire in **60 s** (mint per click, never persist), upload URLs 2 h; metadata pinned {uuid, filename, content_type, size ≤ 512 MiB, sha256}. Desktop background-caches shared attachments: ≤ 4 jobs/pass, pass every 20 s, per-job backoff capped 15 min.
- Comments: body ≤ 16 KiB; anchor quote ≤ 4096 B with 256 B prefix/suffix context; pages of **30 with one-row lookahead** — the page size is derived from a 1 MiB RPC response cap against ~21 KiB max rows, not UX; raising the cap requires recomputing it.
- Invitation emails are sent by the API (transactional template, request ≤ 8 KiB) — never by the client (service keys and rate limiting stay server-side).
- Attachment E2EE backup blobs (encrypted cloud backup, distinct from plaintext share attachments): magic `ANABLB01`, version 1, 4 MiB plaintext chunks (max 512 MiB), 24-byte header nonce, 16-byte chunk-nonce prefix + counter (detects truncation/reordering), per-object key = HKDF(workspace key, salt `meeki-e2ee-attachment-blob-key-v1`) with separate header/chunk subkeys; ciphertext size exactly computable up-front for quota checks; server-visible references HMAC-blinded per (workspace, attachment, content-version).
- **Offline degradation contract:** all edits land in local SQLite first; sync is strictly background; there is deliberately **no user-visible offline mode** — every subsystem has an idempotent retry loop with its own cadence, and correctness never depends on a retry succeeding in order.

> **Hard-won traps (sync):**
> - Length-prefixed HMAC inputs; AAD context binding; decrypt-then-recompute-id.
> - Same total order in applier and witness; derived (not queued) witness pending set.
> - Receive-only cursor reset (the four-cursor reset bug); send-cursor advance guard list.
> - Drain-then-hold lease semantics; await-cancelled-operations (write-lock leak); lease handoff on crash recovery.
> - ReceiveOnly during pending resync; byte-exact barrier round-trip.
> - Foreign-row scan before workspace claim rewrite.

---

### 3.8 Product surface: settings, onboarding, billing — difficulty 4/5

*(Conventional screens, but a wide surface — 10 settings tabs, ~27 AI providers, native tray/floating-panel FFI, offline PDF export, keychain migration, a trial-lifecycle state machine — dense with tuned constants and ordering constraints.)*

#### Settings
- ~40 registered keys with defaults, notably: autostart=false, auto_stop_meetings=true, auto_start_scheduled_meetings=true, auto_join_scheduled_meetings=false, floating_bar_enabled=true, floating_bar_opacity=0.78, live_caption_opacity=0.3, live_caption_width=440, live_caption_line_count=1, live_caption_position="topCenter", live_caption_minimized=true, show_app_in_dock=true, show_tray_icon=true, theme="system", save_recordings=true, audio_retention="forever", microphone_device="" (system default), notification_event=true, notification_detect=true, respect_dnd=false, **telemetry_consent=false**, consent_auto_send_chat=false, capture_meeting_chat=false, cloud_sync_enabled=true, ai_language="en", spoken_languages=[], dictionary terms=[], mic_active_threshold=15, llm_thinking=false; no-default keys: current STT/LLM provider+model, timezone, week_start, selected_template_id.
- Setting writes trigger immediate side effects: autostart → OS login item; detection keys → pushed to the detection service; dock/tray visibility; STT/LLM selection → restart/sync local servers; and **analytics enablement must be recomputed on every settings write** (`setDisabled(!(telemetry_consent ?? false))`) — not only when the key changed — so a fresh install with no stored consent never has analytics enabled.
- Settings tabs: account, app (default), notifications, sync, permissions, developers, dictionary, transcription, intelligence, todo; unknown tab ids alias to app.
- Audio retention offers exactly [none, 1 day, 3 days, 1 week, 1 month, forever] (default forever); changing it atomically also sets save_recordings = (value ≠ none) in the same write (a derived boolean other subsystems read).
- Microphone picker: poll devices every 3000 ms; "Current default" sentinel maps to stored ""; when the stored device disappears, prepend it labeled "(Unavailable — using current default)" instead of silently resetting (preserves the choice for reconnection).
- Notifications tab: event notifications, detection with delay select {5,10,15,30,60,120} s (default 15), an app-exclusion list seeded from the default-ignored bundle ids (tagged "(default)"), Respect-DND (default off, disabled unless a notification type is enabled). Exclusions store as **two** lists — user-ignored and user-re-included — because default-ignored apps can't be removed from the default set; re-including must be recorded as an explicit include.
- Permissions page (macOS): Microphone, System audio, Accessibility, Calendar; row action requests when undetermined but **opens OS Settings when authorized or denied** (denied permissions cannot be re-requested programmatically on macOS).
- Cloud Sync tab: gated on Pro AND signed-in (upsell card otherwise); status polls every 10 s including unfocused; enabling runs the E2EE preflight (recovery-key setup dialog; enable only after setup); the effective toggle reads OFF while stored-enabled but E2EE unconfigured. Status card has 7 distinct states (paused/setup-required/unavailable/needs-attention/saved-locally-during-capture/restoring/connecting/syncing/synced-with-timestamp). Sign-out is refused while unsent local changes exist ("Sync your changes before signing out.").
- **API keys in the OS keychain** (scope "ai-provider-api-keys", key "<llm|stt>:<providerId>"); DB provider rows persist {type, base_url, api_key:""} with the key always blanked. If migrating from any plaintext storage: move keys to keychain, rewrite rows with `PRAGMA secure_delete=ON`, finish with `PRAGMA wal_checkpoint(TRUNCATE)` (otherwise plaintext survives in freed pages/WAL). Writes use a 5-attempt optimistic-CAS loop with keychain rollback on failure (keeps DB and keychain consistent without cross-store transactions). Detect the macOS "couldn't access your login Keychain" failure and offer a repair command.
- STT provider catalog: AssemblyAI (Recommended), Deepgram, On-device (Local badge, no config), OpenAI (batch-only), Cartesia, Cloudflare Workers AI, Gladia, Soniox, ElevenLabs, Mistral, Pyannote (batch-only), Aqua Voice (batch-only), custom; all cloud providers require api_key. LLM catalog: on-device (Local, no config), LM Studio (127.0.0.1:1234/v1 with availability probe), Ollama (127.0.0.1:11434/v1 probe), OpenRouter, OpenAI, Anthropic, Mistral, Azure OpenAI/AI (Beta), Google Generative AI, Cloudflare, Venice, custom; plus the Thinking toggle (default off — "it multiplies summary latency, and short tasks run on tight token budgets").
- If a retired provider id survives in stored settings, clear it once billing/config is ready (a dangling provider makes enhance silently fail).
- Eligibility blocker codes for provider/model selection: requires_auth, requires_entitlement, missing_config(fields), model_not_downloaded, unsupported_platform, missing_provider/model, provider_disabled — each rendered distinctly (locked rows get an upgrade CTA).
- Dictionary page: multi-term free-text input, normalized/deduped (add disabled when nothing new), stored as a JSON string array; terms feed STT keyword boosting.
- UI language derives from the ai_language setting (no separate UI-language key): exact locale → base language → "en" against the bundled catalog set; transcription language pickers are limited to a 48-code core list; the spoken list always excludes the main language and dedupes by base code. First run seeds languages from OS preferences only when unset.
- Week start offers Sunday/Monday; choosing the system default stores "" (so future OS locale changes keep tracking).
- Templates: SQLite rows (title, description, pinned, pin_order, category, icon, targets, sections[{title, description}]); reads are **lenient** (bare strings allowed, invalid rows dropped individually with a console error), writes assert the canonical shape — template JSON has gone through multiple historical shapes and a strict reader wipes user templates on load. Favoriting sets pin_order = max+1; duplicating appends " (Copy)".

#### Export
- Formats: PDF / TXT / Markdown / Org with include-toggles Memo (off), Summary (on), Transcript (off); export disabled with zero selections; filename = sanitized title + "_" + ISO timestamp ([:. ] → "-"), written to Downloads and revealed.
- PDF renders via an **embedded Typst compiler with bundled fonts** (e.g. Pretendard Regular/Medium/SemiBold/Bold): 2.5 cm margins, 11 pt body, 18/14/12 pt headings, a cover page with 28 pt title, page breaks between sections. Fonts must be bundled — PDF export is fully offline and system-font fallback breaks CJK.

#### Chat assistant & machine surfaces
- The chat assistant exposes exactly 12 local tools: list_meetings (limit 20 cap 200), get_meeting, get_meeting_transcript (word-offset pagination, 200 cap 500), get_recurring_meeting_history (cap 200), search_meeting_content (5 cap 10, scored snippets), find_related_meetings (recency score += max(1, 7 − ⌊distanceDays⌋)), search_meetings, search_contacts, search_calendar_events (8 cap 20), web_search (requires sign-in; returns a typed error object, never throws; forbidden for locally-answerable questions), edit_summary, apply_session_correction (old→new replacement targeting summary|transcript|both, optionally feeding the dictionary — it is a multi-target contract, not a single-document find/replace).
- A CLI (`meeki`) reads the same local DB: meetings list/get/note/transcript/history/export, doctor, and an MCP stdio server (read-only). Settings → Developers embeds a CLI installer and a copyable MCP config.

#### Billing & trial
- Billing derives from JWT claims: entitlements array, subscription_status, trial_end (unix s), has_payment_method. isTrialing = status "trialing" AND ceil(secondsRemaining/86400) > 0; during trialing the pro entitlement counts **only while unexpired** (stale JWTs carry dead trials); plan = trial | pro | free. Trial length **21 days**. Pricing: Free $0, Pro $15/mo or $150/yr.
- A client-side Pro grant for development/admin: a force env var or an email allowlist injects the pro entitlement client-side (server routes still require real claims).
- Trial dialogs fire at most once per user via localStorage seen-flags: trial-started; payment reminders at ≤ 7 days and again at ≤ 3 days (the ≤3 re-fires even if ≤7 was seen); trial-ended only after confirming ineligibility via the API AND one forced session refresh (a stale JWT may lack trial_end; ref-gate the refresh to prevent loops).
- Upgrade/portal actions open external browser URLs; use a **ref-based in-flight guard** against rapid double clicks (React disabled-state demonstrably races — a second click lands before the disabled render).
- Pro gates: cloud sync + E2EE status, Google/Outlook calendars (Apple is free), shareable links, attachment cloud sync, hosted cloud STT (signed-in AND paid), playback-rate control (non-Pro forced to 1×), any provider/model whose requirements include a pro entitlement.
- Onboarding: step order macOS [permissions, login, calendar, final], others [login, calendar, final]; login skippable; after sign-in a Pro trial auto-starts exactly once (ref-guarded) and waits ~3000 ms (started) / 1500 ms (skipped/error) for JWT propagation before continuing — continuing instantly shows the user as free right after activation. Finish: idempotently find-or-create the welcome note (fixed tracking id; oldest wins; module-level promise dedupes), set onboarding-complete with 100 ms sleeps around the write, hand off the welcome session id via localStorage in case a storage-change-scheduled relaunch fires.

#### Tray, floating bar, live captions
- Tray icon: template image, menu on left-click, live title "Title • 12m left" / "Title • in 17h 20m" (≤ 30 chars, ellipsized); refresh on a 1 s loop but **only call set-title when the string changed** (1 Hz flicker/IPC otherwise); clearing must pass Some("") — the underlying library treats None as a no-op on macOS. Recording animates at 250 ms/frame; static-icon precedence update-available > degraded > default. Menu: ≤ 3 agenda items under Today/Tomorrow, Show-events toggle, Open, Start, Settings, version, Check updates, Quit; rebuild only when the computed agenda changed.
- The floating meeting bar is a native panel (FFI; non-macOS = silent no-ops) shown while listening: amplitude = min(hypot(mic, speaker), 1), status error when degraded, buttons emit stop / open-main / settings-change back to the app. Native-originated settings changes route through the **same normalization + persist path** as the webview's (two UIs edit the same keys; anything else fights). If native commands report unavailable once, latch off further updates.
- Overlay setting clamps on every read AND every native write: bar opacity [0.35, 0.95] (0.78), caption opacity [0.05, 1] (0.3), caption width [260, 640] px (440), line count integer [1, 4] (1), position ∈ {topCenter, topLeft, topRight, bottomLeft, bottomRight, bottomCenter}; non-finite → defaults.
- Live captions render only when listening AND live transcription active AND not minimized; reset to minimized at the start of **every** new session (keyed by sessionId — a caption bar left open last week must not surprise a new meeting). Truncate from the **start** at a word boundary with a "... " prefix (keep the newest words): charsPerLine = max(12, ⌊(width − 32 px) / 7.8 px⌋), maxChars = max(24, charsPerLine × lineCount).
- Floating transcript bubbles: sort (start, end, id); direct-mic labels "You"; join tokens with punctuation reattachment (strip space before ,.?!;:); flag overlaps only between **different** speakers overlapping ≥ 300 ms.
- Recording consent surface: optional "post disclosure in meeting chat" toggle (default off; posting failure must NOT stop listening; copy must state a disclosure does not confirm consent) and a separate "capture meeting chat into notes" toggle (default off, requires Accessibility).

> **Hard-won traps (surface):**
> - Analytics sync on every write (unset consent = opt-out).
> - Keychain migration with secure_delete + WAL truncate; CAS + keychain rollback.
> - Ref-guards (not disabled-state) on double-clickable money actions; JWT-propagation waits.
> - Some("") tray title; changed-only set_title; native/webview settings through one path.
> - Lenient-read/strict-write template parsing; coupled audio-retention/save-recordings write.

---

## 4. Non-functional requirements

**Privacy guarantees (testable):**
- With no account configured, the app must issue **zero network requests** except user-initiated model downloads and explicit BYOK calls. No phone-home on changelog, onboarding, or tray interactions.
- telemetry_consent defaults false; analytics/crash reporting must be provably disabled until consent (recomputed on every settings write). Crash reporting on the native side requires an explicit env opt-in.
- API keys: keychain only; recovery key: keychain only; capability tokens: URL fragments only; share handoffs bind to HMACed IPs (no IP persisted).
- E2EE sync leaks neither schema nor content: server sees blinded record ids, sizes, and timing only.

**Memory budgets (per Mac tier):** the local-LLM recommender must respect the table in §3.3 (8 GB → 2.5 GB model; 16 GB → 7.1 GB; 24 GB+ → 13.6 GB), fitting inside Metal's ~75% working-set budget with ~2 GB spare for KV cache; KV cache ≈ 20 KB/token (64k ctx ≈ 1.3 GB). The idle-sleeping LLM server must drop to ~80 MB RSS.

**Performance targets (measured on the reference implementation):**
- Model warm-up ≈ `1 + size/1.5 GB/s` seconds (7.1 GB model: ~3.0 s warm cache / ~4.8 s evicted; ~4.0/6.2 s end-to-end with completion); LLM idle sleep default 300 s (floor 30 s).
- Live captions visible within a few seconds of speech (250 ms local flush cadence; 120 ms streaming chunks).
- Recorder flush ≤ 1 s of data loss on crash; capture recovery from the lifecycle marker on next launch.
- Audio level UI ≤ 10 events/s; sidebar countdown re-renders only on change.
- Batch transcription timeout scales with duration (§3.2); UI progress for local batch is monotonic.

**Offline behavior:** every feature in fully-local mode works with networking disabled. Cloud features degrade per the §3.7 contract (background retries, durable caches, deferred publishes); no user-visible "offline mode" switch exists.

**Platform:** macOS (Apple Silicon) is the primary target; system-audio capture requires macOS 14.4+; MLX models require macOS 15 (app minimum). The app must be correctly code-signed with real entitlements — an ad-hoc *linker-signed* bundle silently breaks microphone permission because macOS cannot attribute TCC grants to it.

**Reliability:** a crash at any point (mid-capture, mid-sync-phase, mid-recovery-phase, mid-download) must be recoverable: capture via the lifecycle marker + retained audio; sync via CAS-phased state machines; downloads via idempotent restart + deep readiness checks.

---

## 5. Technical architecture recommendation

*(Recommendation with rationale — not a description of any existing repository.)*

- **Shell: Tauri v2** (Rust core + system webview). Rationale: native CoreAudio/EventKit/AX access requires Rust/Swift anyway; Tauri keeps the bundle small enough to ship a ~50 MB llama.cpp runtime and ONNX models inside it.
- **Frontend: React + TypeScript** (Vite), TanStack Router/Query/Form, Zustand for ephemeral UI (tabs, live listener state), Lingui for i18n, ProseMirror (TipTap) for the editor. Most UX is tab-based inside one main window, not routes.
- **Canonical store: SQLite** on the Rust side; schema and migrations live in Rust; the webview consumes only execute/subscribe (live query) APIs. A typed TS mirror of the schema is generated for query building. Full-text search via an embedded index (Tantivy) with dirty-queue feeding.
- **Audio pipeline: an actor system in Rust** (root → session supervisor → recorder/source/listener) with restart budgets and typed stop reasons (§3.1). Mic via cpal; system audio via CoreAudio process taps; DSP models (Silero VAD, DTLN AEC/denoise, segmentation) as embedded ONNX with a lightweight runtime.
- **STT: the two-model local design** (§3.2) — a CoreML streaming model for live preview and CoreML/MLX batch models for the authoritative transcript — behind a Swift package bridged over a synchronous C ABI (JSON in/out, f32 LE buffers), called from Rust on blocking threads. Cloud/BYOK providers normalize to one Deepgram-shaped response type.
- **Local LLM: bundle llama.cpp `llama-server`** and manage it as a child process with exactly the flags in §3.3 (`--reasoning-format deepseek`, `--chat-template-kwargs {"enable_thinking":false}`, `--sleep-idle-seconds 300`, `-ngl 99`, ctx 65536 clamped 8192–262144). Weights download from Hugging Face; never bundle weights. Rationale: llama-server provides an OpenAI-compatible endpoint, idle-sleep weight unloading, and Metal offload with zero custom inference code.
- **Cloud API: a thin stateless HTTP service** (any framework) fronting: auth (JWT claims carrying entitlements), STT/LLM relays, the sync token exchange + witness log, share snapshot/comments/handoff routes, and calendar/ticket proxies with OAuth credentials held server-side (e.g. via Nango). Postgres for accounts/shares; a SQLite-compatible sync backend for the encrypted replica; Stripe for billing with entitlements projected into JWTs.
- **Sync: field-level E2EE over a generic record-sync transport** (§3.7). The E2EE layer (blinding, sealing, witness, recovery) is application code and must not trust the transport.
- **Packaging:** signed macOS app; the updater optional and off by default in privacy builds; all bundled resources (llama runtime, ONNX models, fonts) verified at startup.

---

## 6. Build plan — phased milestones

Risky native work (system audio tap, AEC alignment) is deliberately front-loaded.

**M0 — Walking skeleton (1–2 weeks of the schedule).**
Tauri shell + SQLite with migrations + live queries + tabbed UI shell + a plain session CRUD note. **Also in M0 (de-risking):** a spike proving the CoreAudio process tap + private aggregate device + mic capture running concurrently on target hardware, including the 50 ms ordering workaround and silence keepalive.
*Exit:* create/edit/persist a note across restart; record raw dual-track WAV from mic + system audio on macOS 14.4+.

**M1 — Record + transcribe locally.**
Full audio pipeline (ring buffers, resampler with rate-change drain, joiner, GCC-PHAT alignment, DTLN AEC + linear residual, VAD mask, recorder with mp3 finalize + fsync discipline, actor supervision with restart budgets and device-change handling). Swift STT bridge with the streaming + batch models; ephemeral live preview; post-stop batch promotion; capture lifecycle marker + crash recovery; echo gate.
*Exit:* J1 steps 4–5 pass offline, including kill-the-app-mid-recording recovery; device hot-swap mid-meeting keeps recording seamlessly; remote speech is not duplicated as "you".

**M2 — Summarize + editor.**
Bundled llama-server management (flags, idle sleep, warm-up detection), model recommendation by RAM, download UX with cancel; enhance pipeline (sampling, validation, length policy, CAS persistence, title generation); ProseMirror editor with the markdown dialect, H1 enforcement, write queue, cross-window sync, attachments, tasks, mentions.
*Exit:* record → transcript → streamed summary persisted; two windows edit the same note without echo loops or IME corruption; markdown round-trip preserves empty paragraphs, image widths, attachments.

**M3 — Model management + BYOK.**
Provider catalogs (STT + LLM), keychain key storage with CAS/rollback, adapter layer normalized to the Deepgram shape, dual-channel strategies, live/batch mode tables, language routing, error normalization, batch fallback + auth-retry, audio import (J4).
*Exit:* J5 passes against at least Deepgram, AssemblyAI, and one OpenAI-compatible LLM; socket death mid-meeting degrades to batch repair; import of every supported container produces a transcript.

**M4 — Calendar + detection.**
EventKit singleton integration, sync/diff engine with soft-delete resurrection, per-occurrence tracking ids, notifications (5-min, dedup, click semantics), auto-start countdown with the armed guard, mic-usage detection (listeners, 15 s threshold, cooldown, ignore lists), auto-stop (5 s confirm, fail-safe snapshot checks, offline grace, early-end prompt), tray agenda, sleep/wake handling.
*Exit:* J2 and J3 pass; declined events never appear; a transient calendar API failure deletes nothing; pulling Wi-Fi mid-meeting does not stop the recording.

**M5 — Cloud: auth, billing, sync, sharing.**
Auth + JWT entitlements + trial lifecycle; Google/Outlook via server-held OAuth; E2EE sync (keys, blinded records, witness, leases, poison recovery), token exchange, workspace claim; sharing (snapshots, CAS publish, invitations, public slugs, handoff, comments); web share viewer.
*Exit:* J6 passes; two devices converge under concurrent edits; a simulated malicious server serving stale records is rejected (witness); recovery completes after killing the app in every phase; a captured session never uploads half-written.

**M6 — Polish, i18n, updater.**
Floating bar + live captions, PDF/TXT/MD/Org export with bundled fonts, chat assistant tools, CLI + MCP, dictionary, onboarding flow with welcome note + trial auto-start, i18n extraction across the full surface (~109 display locales; 48 transcription codes), optional auto-updater, signing/notarization, QA pass over every acceptance criterion in §2.
*Exit:* onboarding-to-summary in under 10 minutes on a clean machine, in a non-English locale, fully offline after the model download.

---

## 7. Risk register — what a rewriter gets wrong

| # | Risk | Mitigation (spec section) |
|---|------|---------------------------|
| 1 | **CoreAudio tap ordering**: opening mic+tap simultaneously fails intermittently; tap_auto_start / private-aggregate keys; missing silence keepalive stalls capture only when no audio plays | §3.1; M0 spike on real hardware |
| 2 | **Skipping GCC-PHAT alignment** because "the AEC model handles it" — ~450 ms speaker→mic lag makes DTLN useless; the 9-constant lock state machine cannot be re-derived quickly | §3.1; keep the constants |
| 3 | **Rate-change resampler drain**: device switches mid-stream garble buffered audio unless buffered samples keep their capture rate and the drain dance runs | §3.1; pin with unit test |
| 4 | **Tap-device feedback loop**: the app selects its own aggregate device as the mic | §3.1 exclusion in every selection path |
| 5 | **Persisting the live preview** from the local streaming model — visible transcript flips, delete-nonexistent bugs; the batch pass is authoritative | §3.2 |
| 6 | **Parakeet chunk geometry**: mel frames must land in (2000, 3000] ⇒ 29.5 s / 20 s windows; violating it crashes the compiled model | §3.2 |
| 7 | **Echo-gate omission** duplicates every remote utterance as "you" in dual local live mode | §3.2 thresholds |
| 8 | **Sentinel strings & typed codes** treated as cosmetic: error strings and finalize counts are wire contracts across FFI/event boundaries | §3.2 |
| 9 | **llama-server flags**: `--sleep-idle-seconds 0` exits at startup; `/slots`//`/metrics` wake sleeping models; default temperature 0.8 fabricates content | §3.3 |
| 10 | **Editor invariants**: node names as storage format; empty-paragraph round-trip; IME grace + echo-loop breaker; quote-anchor tie→null; CAS persistence racing user edits | §3.4 |
| 11 | **EventKit multi-instance bug** (intermittent empty calendar lists) and per-occurrence tracking-id timezone math | §3.6 |
| 12 | **Detection false positives/negatives**: empty ignore list spams users; missing default-device re-attach silently kills detection after AirPods; missing generation counter leaves zombie timers | §3.6 |
| 13 | **Auto-stop data loss**: stopping on missing evidence, no offline grace, no browser early-end prompt — each loses minutes of real meetings | §3.6 |
| 14 | **Sync rollback/poisoning**: divergent applier/witness ordering; four-cursor reset discarding local writes; publishing during hydration re-poisons the replica; dropping (instead of awaiting) cancelled sync futures leaks the DB write lock against capture | §3.7 |
| 15 | **Crypto shortcuts**: unprefixed HMAC inputs; missing AAD context binding; skipping the decrypt-side record-id recomputation; silent legacy downgrade on malformed key-id | §3.7 |
| 16 | **Key/keychain handling**: plaintext keys recoverable from SQLite freed pages/WAL without secure_delete + WAL truncate; silent recovery-key overwrite destroying the only decryption key | §3.7, §3.8 |
| 17 | **Sleep/wake & timers**: no sleep-stop of recording; frozen countdowns after lid reopen; setTimeout 2³¹−1 overflow firing immediately | §3.6 |
| 18 | **i18n as an afterthought**: UI language derives from ai_language; extraction must cover the full surface before ship — retrofitting ~109 locales is a schedule risk | §3.8, M6 |
| 19 | **Signing**: an ad-hoc linker-signed bundle silently breaks mic permission (TCC cannot attribute the grant) | §4 |
| 20 | **Analytics consent hole**: enabling analytics when consent is merely *unset* | §3.8 |

---

## 8. Out of scope for v1

- **Bot participants** — the product is bot-free capture by design; never joins calls as an attendee.
- **Windows/Linux system-audio capture and meeting detection** — ship stubs (Linux may get PulseAudio mic detection); mic-only recording may work but is not a v1 target.
- **Real-time collaborative editing** of notes (sharing is snapshot-based with web-edit import; no CRDT/OT).
- **Voiceprint-based speaker identification** across meetings (diarization within a meeting only).
- **Mobile apps.**
- **Historical changelog fetching** — only the bundled latest changelog displays; no remote fetch.
- **AX chat message sending beyond Slack Huddles** — hard-disabled until window↔composer pairing is provably safe.
- **E2EE for shared notes** — shares are deliberately plaintext snapshots published explicitly by the owner.
- **Email/ticket integrations beyond the minimal GitHub/Reminders todo surface.**
- **A second bundled inference runtime** — one llama.cpp runtime, one native STT bridge; alternative engines (whisper.cpp fallback) optional.

---

*End of greenfield PRD.*
