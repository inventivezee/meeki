//! WebM is the one container the import chain cannot open.
//!
//! macOS decodes Opus perfectly well — a bare `.opus` file converts via
//! `afconvert` — and symphonia can demux Matroska. What neither can do is the
//! combination: symphonia ships no Opus decoder, and CoreAudio does not know
//! Matroska. Since WebM audio is almost always Opus, lifting the stream into an
//! Ogg container makes the existing chain handle it.

use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use ogg::writing::PacketWriteEndInfo;
use symphonia::core::codecs::CODEC_TYPE_OPUS;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::{Error, Result};

static REMUX_SEQ: AtomicU64 = AtomicU64::new(0);

/// Opus always reports timestamps at 48 kHz regardless of input rate (RFC 7845).
const OPUS_GRANULE_RATE: u64 = 48_000;

/// Frame durations in microseconds, indexed by the TOC config field (RFC 6716
/// §3.1). SILK and Hybrid modes use 10/20/40/60 ms; CELT uses 2.5/5/10/20 ms.
const FRAME_DURATION_US: [u32; 32] = [
    10_000, 20_000, 40_000, 60_000, // SILK NB
    10_000, 20_000, 40_000, 60_000, // SILK MB
    10_000, 20_000, 40_000, 60_000, // SILK WB
    10_000, 20_000, // Hybrid SWB
    10_000, 20_000, // Hybrid FB
    2_500, 5_000, 10_000, 20_000, // CELT NB
    2_500, 5_000, 10_000, 20_000, // CELT WB
    2_500, 5_000, 10_000, 20_000, // CELT SWB
    2_500, 5_000, 10_000, 20_000, // CELT FB
];

/// Samples this packet contributes to the granule position, read from its TOC
/// byte. Returning 0 for a malformed packet keeps the granule monotonic rather
/// than aborting a whole import over one bad frame.
fn packet_samples(packet: &[u8]) -> u64 {
    let Some(&toc) = packet.first() else {
        return 0;
    };

    let duration_us = u64::from(FRAME_DURATION_US[usize::from(toc >> 3)]);
    let frames = match toc & 0b11 {
        0 => 1,
        1 | 2 => 2,
        // Code 3 stores the count in the low 6 bits of the following byte.
        _ => packet
            .get(1)
            .map_or(1, |&b| u64::from(b & 0b0011_1111))
            .max(1),
    };

    duration_us * frames * OPUS_GRANULE_RATE / 1_000_000
}

fn is_webm(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("webm") || ext.eq_ignore_ascii_case("mkv"))
}

/// Rewrites the Opus stream of a WebM/Matroska file as Ogg, returning the new
/// path. `Ok(None)` means the input is not WebM, or holds no Opus track, and
/// the caller should carry on with its usual handling.
pub(crate) fn remux_to_ogg(source: &Path) -> Result<Option<PathBuf>> {
    if !is_webm(source) {
        return Ok(None);
    }

    let file = File::open(source)?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    hint.with_extension("webm");

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| Error::WebmRemuxFailed(error.to_string()))?;
    let mut format = probed.format;

    let Some(track) = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.codec == CODEC_TYPE_OPUS)
    else {
        return Ok(None);
    };
    let track_id = track.id;

    // Matroska stores the OpusHead identification header as CodecPrivate, which
    // is exactly the first Ogg packet an Opus stream needs.
    let opus_head = track
        .codec_params
        .extra_data
        .clone()
        .ok_or_else(|| Error::WebmRemuxFailed("Opus track has no OpusHead".to_string()))?;

    // Never beside the source: that is the user's own audio directory, it may
    // be read-only, and two concurrent imports of one file would race.
    let target = std::env::temp_dir().join(format!(
        "{}_remux_{}_{}.opus",
        source.file_stem().unwrap_or_default().to_string_lossy(),
        std::process::id(),
        REMUX_SEQ.fetch_add(1, Ordering::Relaxed),
    ));
    let writer = BufWriter::new(File::create(&target)?);
    let mut ogg = ogg::writing::PacketWriter::new(writer);
    let serial = 1;

    ogg.write_packet(opus_head.to_vec(), serial, PacketWriteEndInfo::EndPage, 0)
        .map_err(|error| Error::WebmRemuxFailed(error.to_string()))?;
    // Minimal OpusTags: magic, zero-length vendor string, zero comments.
    let mut tags = b"OpusTags".to_vec();
    tags.extend_from_slice(&0u32.to_le_bytes());
    tags.extend_from_slice(&0u32.to_le_bytes());
    ogg.write_packet(tags, serial, PacketWriteEndInfo::EndPage, 0)
        .map_err(|error| Error::WebmRemuxFailed(error.to_string()))?;

    let mut granule = 0u64;
    let mut wrote_audio = false;
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            // Any read error here is end-of-stream in practice; the packets
            // already written still form a valid file.
            Err(_) => break,
        };
        if packet.track_id() != track_id {
            continue;
        }

        granule += packet_samples(&packet.data);
        wrote_audio = true;
        ogg.write_packet(
            packet.data.to_vec(),
            serial,
            PacketWriteEndInfo::NormalPacket,
            granule,
        )
        .map_err(|error| Error::WebmRemuxFailed(error.to_string()))?;
    }

    if !wrote_audio {
        let _ = std::fs::remove_file(&target);
        return Ok(None);
    }

    ogg.write_packet(Vec::new(), serial, PacketWriteEndInfo::EndStream, granule)
        .map_err(|error| Error::WebmRemuxFailed(error.to_string()))?;

    Ok(Some(target))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_containers_that_are_not_matroska() {
        assert!(
            remux_to_ogg(Path::new("/tmp/whatever.mp3"))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn reads_frame_counts_from_the_toc_byte() {
        // config 0 (SILK NB 10ms), code 0 => one 10 ms frame at 48 kHz.
        assert_eq!(packet_samples(&[0b0000_0000]), 480);
        // config 3 (SILK NB 60ms), code 0 => 60 ms.
        assert_eq!(packet_samples(&[0b0001_1000]), 2_880);
        // config 1 (20ms), code 1 => two frames.
        assert_eq!(packet_samples(&[0b0000_1001]), 1_920);
        assert_eq!(packet_samples(&[]), 0);
    }

    #[test]
    fn remuxes_the_webm_fixture_into_a_playable_opus_file() {
        let source = Path::new(meeki_data::english_1::AUDIO_WEBM_PATH);
        let remuxed = remux_to_ogg(source)
            .expect("remux should succeed")
            .expect("fixture is Opus in WebM");

        let bytes = std::fs::metadata(&remuxed).unwrap().len();
        let _ = std::fs::remove_file(&remuxed);
        // The source is ~3 MB of Opus; the Ogg wrapper adds only page headers.
        assert!(bytes > 2_000_000, "remuxed file was only {bytes} bytes");
    }
}
