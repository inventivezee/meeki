use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("failed to read Granola's cache file: {0}")]
    CacheFileMissing(#[from] std::io::Error),

    #[error("failed to read cache file: {0}")]
    CacheFileRead(std::io::Error),

    #[error("failed to parse cache JSON: {0}")]
    CacheJsonParse(#[source] serde_json::Error),

    #[error("failed to create output directory: {0}")]
    CreateDirectory(std::io::Error),

    #[error("failed to write file {path}: {source}")]
    WriteFile {
        path: String,
        source: std::io::Error,
    },

    #[error("failed to serialize YAML frontmatter: {0}")]
    YamlSerialize(#[from] serde_yaml::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
