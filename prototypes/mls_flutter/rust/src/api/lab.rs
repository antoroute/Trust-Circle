//! Synthetic lab only. No keys, plaintext or raw MLS state cross this API.
#![forbid(unsafe_code)]

#[derive(Clone, Copy)]
pub enum LabAction {
    Exchange,
    ExchangeBatch,
    Update,
    AddThird,
    RemoveThird,
}

pub struct LabReply {
    pub session: u32,
    pub epoch: u32,
    pub members: u32,
    pub delivered: u32,
    pub queue_ms: f64,
    pub native_ms: f64,
    pub send_ms: f64,
    pub receive_ms: f64,
}

pub async fn start_lab(parent: String) -> Result<LabReply, String> {
    if parent.is_empty() || parent.len() > 4096 {
        return Err("invalid_input".into());
    }
    crate::actor::submit(crate::actor::Command::Start(parent)).await
}

pub async fn execute_lab(session: u32, action: LabAction, count: u32) -> Result<LabReply, String> {
    if count == 0 || count > 100 {
        return Err("invalid_input".into());
    }
    crate::actor::submit(crate::actor::Command::Execute {
        session,
        action,
        count,
    })
    .await
}

pub async fn close_lab(session: u32) -> Result<LabReply, String> {
    crate::actor::submit(crate::actor::Command::Close(session)).await
}

/// Measures bridge copying/dispatch only, not encryption. Does not echo data.
pub async fn ping(payload: Vec<u8>) -> Result<u32, String> {
    if payload.len() > 16_384 {
        return Err("invalid_input".into());
    }
    Ok(payload.len() as u32)
}
