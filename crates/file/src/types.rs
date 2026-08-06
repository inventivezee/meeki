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
    #[error("Other error: {0}")]
    OtherError(String),
}
