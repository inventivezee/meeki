pub mod cache;
pub mod document;
pub mod error;
pub mod fs;
pub mod importer;
pub mod markdown;
pub mod prosemirror;
pub mod transcript;

use crate::cache::read_cache;
use crate::document::Document;
use crate::error::Result;
use crate::fs::{write_notes, write_transcripts};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct NotesConfig {
    pub cache_path: PathBuf,
    pub output_dir: PathBuf,
}

#[derive(Debug, Clone)]
pub struct TranscriptsConfig {
    pub cache_path: PathBuf,
    pub output_dir: PathBuf,
}

pub fn export_notes(config: &NotesConfig) -> Result<usize> {
    let cache_data = read_cache(&config.cache_path)?;
    let documents: Vec<Document> = cache_data
        .documents
        .iter()
        .filter_map(|(id, doc)| Document::from_cache_value(id, &doc.raw))
        .collect();

    write_notes(&documents, &config.output_dir)
}

pub fn export_transcripts(config: &TranscriptsConfig) -> Result<usize> {
    let cache_data = read_cache(&config.cache_path)?;

    write_transcripts(
        &cache_data.documents,
        &cache_data.transcripts,
        &config.output_dir,
    )
}
