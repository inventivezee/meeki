#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error(transparent)]
    ReqwestError(#[from] reqwest::Error),
    #[error("Error while reading file: {0}")]
    FileIOError(#[from] std::io::Error),
    #[error("Download cancelled")]
    Cancelled,
    /// Kept separate from OtherError so a retry can tell "the signed URL
    /// expired" apart from "this model does not exist". Hugging Face redirects
    /// to a CDN URL carrying an Expires parameter, so a long download can
    /// outlive its own signature.
    #[error("Download failed with status {status}: {url}")]
    HttpStatus { status: u16, url: String },
    /// A 206 whose body ended before the range did. Worth retrying — the range
    /// is still valid — but never worth accepting: nothing downstream compares
    /// the finished file against a size, and the GGUF models ship no checksum,
    /// so a short chunk becomes a truncated model that still passes for whole.
    #[error("range {start}-{end} returned {received} bytes")]
    IncompleteChunk {
        start: u64,
        end: u64,
        received: usize,
    },
    #[error("Other error: {0}")]
    OtherError(String),
}
