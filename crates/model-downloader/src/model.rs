use std::path::Path;
use std::path::PathBuf;

use crate::Error;

pub trait DownloadableModel: Clone + Send + Sync + 'static {
    fn download_key(&self) -> String;
    fn download_url(&self) -> Option<String>;
    fn download_checksum(&self) -> Option<u32> {
        None
    }
    /// Declared size, used to tell a resumable partial apart from one left by a
    /// different build of the same model. Not a substitute for a checksum: it
    /// cannot detect upstream replacing a file at the same URL and size.
    fn download_size(&self) -> Option<u64> {
        None
    }
    fn download_destination(&self, models_base: &Path) -> PathBuf;
    fn is_downloaded(&self, models_base: &Path) -> Result<bool, Error>;
    fn finalize_download(&self, downloaded_path: &Path, models_base: &Path) -> Result<(), Error>;
    fn delete_downloaded(&self, models_base: &Path) -> Result<(), Error>;

    fn remove_destination_after_finalize(&self) -> bool {
        false
    }
}
