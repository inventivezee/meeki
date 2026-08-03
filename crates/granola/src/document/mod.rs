//! Granola's document shapes.
//!
//! These lived under an `api` module until the importer stopped talking to
//! api.granola.ai. The types stayed because Granola's own offline cache stores
//! documents under the same field names its API returned.
mod models;

pub use models::*;
