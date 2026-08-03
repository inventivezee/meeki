use crate::cache::{CacheData, CacheDocument, TranscriptSegment, read_cache};
use crate::document::Document;
use crate::error::Result;
use crate::prosemirror::convert_to_plain_text;
use meeki_importer_core::ir::{Collection, Session, Tag, TagMapping, Transcript, Word};
use std::collections::HashMap;
use std::path::Path;

/// Imports from Granola's local cache file, and only from there.
///
/// This used to lift the user's Granola access token out of `supabase.json` and
/// call api.granola.ai with a spoofed `User-Agent`, impersonating their client.
/// The cache holds the same documents alongside the transcripts, so the network
/// call bought nothing that reading the user's own disk does not.
pub async fn import_all_from_path(path: &Path) -> Result<Collection> {
    let cache_data = read_cache(path)?;
    let documents: Vec<Document> = cache_data
        .documents
        .iter()
        .filter_map(|(id, doc)| Document::from_cache_value(id, &doc.raw))
        .collect();

    let mut sessions = Vec::new();
    let mut tags: Vec<Tag> = Vec::new();
    let mut tag_mappings: Vec<TagMapping> = Vec::new();
    let mut tag_name_to_id: HashMap<String, String> = HashMap::new();

    for doc in documents {
        let session = document_to_session(&doc);

        for tag_name in &doc.tags {
            let tag_id = tag_name_to_id
                .entry(tag_name.to_string())
                .or_insert_with(|| {
                    let id = uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID, tag_name.as_bytes())
                        .to_string();
                    tags.push(Tag {
                        id: id.clone(),
                        user_id: String::new(),
                        name: tag_name.clone(),
                    });
                    id
                })
                .clone();

            tag_mappings.push(TagMapping {
                id: format!("{}_{}", tag_id, session.id),
                user_id: String::new(),
                tag_id,
                session_id: session.id.clone(),
            });
        }

        sessions.push(session);
    }

    let transcripts = cache_data_to_transcripts(&cache_data);

    Ok(Collection {
        sessions,
        transcripts,
        humans: vec![],
        organizations: vec![],
        participants: vec![],
        templates: vec![],
        enhanced_notes: vec![],
        tags,
        tag_mappings,
    })
}

fn document_to_session(doc: &Document) -> Session {
    let content = get_document_content(doc);

    Session {
        id: doc.id.clone(),
        user_id: String::new(),
        created_at: doc.created_at.clone(),
        title: doc.title.clone(),
        raw_md: Some(content),
        enhanced_content: None,
        folder_id: None,
        event_id: None,
    }
}

fn get_document_content(doc: &Document) -> String {
    if let Some(ref notes) = doc.notes {
        let content = convert_to_plain_text(notes).trim().to_string();
        if !content.is_empty() {
            return content;
        }
    }

    if let Some(ref panel) = doc.last_viewed_panel {
        if let Some(ref content) = panel.content {
            let text = convert_to_plain_text(content).trim().to_string();
            if !text.is_empty() {
                return text;
            }
        }

        if !panel.original_content.is_empty() {
            return panel.original_content.clone();
        }
    }

    doc.content.clone()
}

fn cache_data_to_transcripts(cache_data: &CacheData) -> Vec<Transcript> {
    cache_data
        .transcripts
        .iter()
        .filter_map(|(doc_id, segments)| {
            if segments.is_empty() {
                return None;
            }

            let doc = cache_data
                .documents
                .get(doc_id)
                .cloned()
                .unwrap_or_else(|| CacheDocument {
                    id: doc_id.clone(),
                    title: doc_id.clone(),
                    created_at: String::new(),
                    updated_at: String::new(),
                    raw: serde_json::Value::Null,
                });

            Some(cache_document_to_transcript(&doc, segments))
        })
        .collect()
}

fn cache_document_to_transcript(doc: &CacheDocument, segments: &[TranscriptSegment]) -> Transcript {
    let words: Vec<Word> = segments
        .iter()
        .map(|seg| Word {
            id: seg.id.clone(),
            text: seg.text.clone(),
            start_ms: parse_timestamp_to_ms(&seg.start_timestamp),
            end_ms: parse_timestamp_to_ms(&seg.end_timestamp),
            channel: 0,
            speaker: Some(match seg.source.as_str() {
                "microphone" => "You".to_string(),
                _ => "System".to_string(),
            }),
        })
        .collect();

    let start_ms = words.first().and_then(|w| w.start_ms);
    let end_ms = words.last().and_then(|w| w.end_ms);

    Transcript {
        id: doc.id.clone(),
        user_id: String::new(),
        created_at: doc.created_at.clone(),
        session_id: doc.id.clone(),
        title: doc.title.clone(),
        started_at: start_ms.unwrap_or(0.0),
        ended_at: end_ms,
        start_ms,
        end_ms,
        words,
        speaker_hints: vec![],
    }
}

fn parse_timestamp_to_ms(timestamp: &str) -> Option<f64> {
    let parts: Vec<&str> = timestamp.split(':').collect();
    if parts.len() != 3 {
        return None;
    }

    let hours: f64 = parts[0].parse().ok()?;
    let minutes: f64 = parts[1].parse().ok()?;

    let sec_parts: Vec<&str> = parts[2].split('.').collect();
    let seconds: f64 = sec_parts[0].parse().ok()?;
    let millis: f64 = if sec_parts.len() > 1 {
        let ms_str = sec_parts[1];
        let padded = format!("{:0<3}", ms_str);
        padded[..3].parse().unwrap_or(0.0)
    } else {
        0.0
    };

    Some((hours * 3600.0 + minutes * 60.0 + seconds) * 1000.0 + millis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Granola stores its cache as JSON-inside-a-JSON-string.
    fn write_cache(documents: &str, transcripts: &str) -> tempfile::NamedTempFile {
        let inner =
            format!(r#"{{"state":{{"documents":{documents},"transcripts":{transcripts}}}}}"#);
        let outer = serde_json::json!({ "cache": inner }).to_string();
        let mut file = tempfile::NamedTempFile::new().unwrap();
        file.write_all(outer.as_bytes()).unwrap();
        file
    }

    #[tokio::test]
    async fn imports_notes_and_tags_from_the_cache_without_any_network_call() {
        // The whole point of dropping the API client: everything the import
        // needs is already in the file on the user's own disk.
        let documents = r#"{
            "doc-1": {
                "title": "Launch review",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "tags": ["launch", "product"],
                "notes": {"type":"doc","content":[
                    {"type":"paragraph","content":[{"type":"text","text":"Ship on Monday."}]}
                ]}
            }
        }"#;
        let transcripts = r#"{
            "doc-1": [{
                "id": "seg-1", "document_id": "doc-1",
                "start_timestamp": "2026-01-01T14:00:00Z",
                "end_timestamp": "2026-01-01T14:00:05Z",
                "text": "Ship on Monday.", "source": "system", "is_final": true
            }]
        }"#;
        let file = write_cache(documents, transcripts);

        let collection = import_all_from_path(file.path()).await.unwrap();

        assert_eq!(collection.sessions.len(), 1);
        let session = &collection.sessions[0];
        assert_eq!(session.title, "Launch review");
        assert_eq!(
            session.raw_md.as_deref(),
            Some("Ship on Monday."),
            "notes should survive the cache round trip"
        );
        assert_eq!(collection.tags.len(), 2, "tags should survive too");
        assert_eq!(collection.transcripts.len(), 1);
    }

    #[tokio::test]
    async fn keeps_a_document_whose_optional_fields_are_missing() {
        // The cache is Granola's private format with no stability promise, so a
        // sparse or renamed field must cost that value, not the meeting.
        let file = write_cache(r#"{"doc-1":{"title":"Bare minimum"}}"#, r#"{}"#);

        let collection = import_all_from_path(file.path()).await.unwrap();

        assert_eq!(collection.sessions.len(), 1);
        assert_eq!(collection.sessions[0].title, "Bare minimum");
        assert!(collection.tags.is_empty());
    }
}
