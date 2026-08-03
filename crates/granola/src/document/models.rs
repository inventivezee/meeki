use serde::{Deserialize, Deserializer};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
pub struct GranolaResponse {
    pub docs: Vec<Document>,
}

#[derive(Debug, Clone)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub notes: Option<ProseMirrorDoc>,
    pub notes_plain: Option<String>,
    pub last_viewed_panel: Option<LastViewedPanel>,
}

impl<'de> Deserialize<'de> for Document {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct RawDocument {
            id: String,
            title: String,
            #[serde(default)]
            content: String,
            created_at: String,
            updated_at: String,
            #[serde(default)]
            tags: Vec<String>,
            notes: Option<Value>,
            notes_plain: Option<String>,
            last_viewed_panel: Option<LastViewedPanel>,
        }

        let raw = RawDocument::deserialize(deserializer)?;

        let notes = raw.notes.and_then(|v| parse_maybe_stringified_json(&v));

        Ok(Document {
            id: raw.id,
            title: raw.title,
            content: raw.content,
            created_at: raw.created_at,
            updated_at: raw.updated_at,
            tags: raw.tags,
            notes,
            notes_plain: raw.notes_plain,
            last_viewed_panel: raw.last_viewed_panel,
        })
    }
}

#[derive(Debug, Clone)]
pub struct LastViewedPanel {
    pub document_id: Option<String>,
    pub id: Option<String>,
    pub created_at: Option<String>,
    pub title: Option<String>,
    pub content: Option<ProseMirrorDoc>,
    pub deleted_at: Option<String>,
    pub template_slug: Option<String>,
    pub last_viewed_at: Option<String>,
    pub updated_at: Option<String>,
    pub content_updated_at: Option<String>,
    pub original_content: String,
}

impl<'de> Deserialize<'de> for LastViewedPanel {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct RawLastViewedPanel {
            document_id: Option<String>,
            id: Option<String>,
            created_at: Option<String>,
            title: Option<String>,
            content: Option<Value>,
            deleted_at: Option<String>,
            template_slug: Option<String>,
            last_viewed_at: Option<String>,
            updated_at: Option<String>,
            content_updated_at: Option<String>,
            #[serde(default)]
            original_content: String,
        }

        let raw = RawLastViewedPanel::deserialize(deserializer)?;

        let content = raw.content.and_then(|v| parse_maybe_stringified_json(&v));

        Ok(LastViewedPanel {
            document_id: raw.document_id,
            id: raw.id,
            created_at: raw.created_at,
            title: raw.title,
            content,
            deleted_at: raw.deleted_at,
            template_slug: raw.template_slug,
            last_viewed_at: raw.last_viewed_at,
            updated_at: raw.updated_at,
            content_updated_at: raw.content_updated_at,
            original_content: raw.original_content,
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProseMirrorDoc {
    #[serde(rename = "type")]
    pub doc_type: String,
    #[serde(default)]
    pub content: Vec<ProseMirrorNode>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProseMirrorNode {
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub content: Vec<ProseMirrorNode>,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub attrs: Option<serde_json::Map<String, Value>>,
}

impl Document {
    /// Builds a document from an entry in Granola's local cache.
    ///
    /// Read field by field on purpose. The cache is Granola's private on-disk
    /// format with no stability guarantee, so an unfamiliar or renamed field
    /// should cost that one value — not the whole note. `id` falls back to the
    /// map key the entry was stored under.
    pub fn from_cache_value(id: &str, value: &Value) -> Option<Self> {
        let object = value.as_object()?;
        let text = |key: &str| object.get(key).and_then(Value::as_str).map(str::to_string);

        Some(Self {
            id: text("id").unwrap_or_else(|| id.to_string()),
            title: text("title").unwrap_or_default(),
            content: text("content").unwrap_or_default(),
            created_at: text("created_at").unwrap_or_default(),
            updated_at: text("updated_at").unwrap_or_default(),
            tags: object
                .get("tags")
                .and_then(Value::as_array)
                .map(|tags| {
                    tags.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default(),
            notes: object.get("notes").and_then(parse_maybe_stringified_json),
            notes_plain: text("notes_plain"),
            // Best effort: losing the AI panel costs the generated summary,
            // while losing the document would cost the meeting.
            last_viewed_panel: object
                .get("last_viewed_panel")
                .and_then(|panel| serde_json::from_value(panel.clone()).ok()),
        })
    }
}

fn parse_maybe_stringified_json(value: &Value) -> Option<ProseMirrorDoc> {
    match value {
        Value::Null => None,
        Value::Object(_) => serde_json::from_value(value.clone()).ok(),
        Value::String(s) => {
            let trimmed = s.trim_start();
            if trimmed.starts_with('<') {
                return None;
            }
            serde_json::from_str(s).ok()
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_document_with_notes_object() {
        let json = r#"{
            "id": "doc-1",
            "title": "Test",
            "content": "",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "tags": [],
            "notes": {"type": "doc", "content": []}
        }"#;
        let doc: Document = serde_json::from_str(json).unwrap();
        assert!(doc.notes.is_some());
        assert_eq!(doc.notes.unwrap().doc_type, "doc");
    }

    #[test]
    fn test_parse_document_with_notes_string() {
        let json = r#"{
            "id": "doc-1",
            "title": "Test",
            "content": "",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "tags": [],
            "notes": "{\"type\": \"doc\", \"content\": []}"
        }"#;
        let doc: Document = serde_json::from_str(json).unwrap();
        assert!(doc.notes.is_some());
        assert_eq!(doc.notes.unwrap().doc_type, "doc");
    }

    #[test]
    fn test_parse_document_with_html_content_skipped() {
        let json = r#"{
            "id": "doc-1",
            "title": "Test",
            "content": "",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "tags": [],
            "notes": "<html>content</html>"
        }"#;
        let doc: Document = serde_json::from_str(json).unwrap();
        assert!(doc.notes.is_none());
    }
}
