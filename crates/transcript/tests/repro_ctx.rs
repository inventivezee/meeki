use meeki_template_app::{ContextBlock, SessionContext, Segment as TplSegment, Transcript as TplTranscript};
use transcript::{
    RenderTranscriptInput, RenderTranscriptRequest, RenderTranscriptWordInput,
    render_transcript_segments,
};

#[derive(serde::Deserialize)]
struct W {
    id: String,
    text: String,
    start_ms: i64,
    end_ms: i64,
    channel: i32,
}

#[test]
fn repro_real_session() {
    let raw = std::fs::read_to_string(
        "/private/tmp/claude-501/-Users-flow-Cursor-Projects-Anarlog/9118df72-6dd0-4d6d-94ad-aa7f18f5564e/scratchpad/words_clean.json",
    )
    .unwrap();
    let ws: Vec<W> = serde_json::from_str(&raw).unwrap();
    let self_id = "997b6783-b45c-420a-ac95-8c97124281a1".to_string();

    let req = RenderTranscriptRequest {
        transcripts: vec![RenderTranscriptInput {
            started_at: Some(0),
            words: ws
                .into_iter()
                .map(|w| RenderTranscriptWordInput {
                    id: w.id,
                    text: w.text,
                    start_ms: w.start_ms,
                    end_ms: w.end_ms,
                    channel: w.channel,
                    speaker_index: None,
                })
                .collect(),
            assignments: vec![],
        }],
        // exactly what the hydrator passes: participants from session_participants
        participant_human_ids: vec![self_id.clone()],
        self_human_id: Some(self_id.clone()),
        // humans filtered by `human.name` truthiness -> empty, because name is ''
        humans: vec![],
    };

    let segs = render_transcript_segments(req);
    println!("SEGMENT COUNT = {}", segs.len());
    for s in segs.iter().take(3) {
        println!("LABEL=[{}] KEY={:?}", s.speaker_label, s.key);
        println!("TEXT={}", &s.text.chars().take(120).collect::<String>());
    }

    let tpl = TplTranscript {
        segments: segs
            .iter()
            .map(|s| TplSegment {
                speaker: s.speaker_label.clone(),
                text: s.text.clone(),
            })
            .collect(),
        started_at: None,
        ended_at: None,
    };

    let block = ContextBlock {
        contexts: vec![SessionContext {
            title: Some("Daydream Strategic Pivot and Fundraising Discussion".into()),
            date: Some("2026-07-27".into()),
            raw_content: None,
            enhanced_content: Some("## Action Items\n- draft deck".into()),
            meeting_chat: None,
            transcript: Some(tpl),
            participants: vec![],
            event: None,
        }],
    };
    let rendered = askama::Template::render(&block).unwrap();
    println!("=== RENDERED BLOCK (first 1500 chars) ===");
    println!("{}", &rendered.chars().take(1500).collect::<String>());
    println!("=== END ===");
    println!(
        "block contains self uuid: {}",
        rendered.contains("997b6783-b45c-420a-ac95-8c97124281a1")
    );
    println!("block contains session id 5247bb63: {}", rendered.contains("5247bb63"));
}
