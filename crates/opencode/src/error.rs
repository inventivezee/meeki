#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("failed to spawn opencode: {0}")]
    Spawn(#[source] std::io::Error),
    #[error("failed to kill opencode process: {0}")]
    Kill(#[source] std::io::Error),
    #[error("opencode process missing stdin")]
    MissingStdin,
    #[error("opencode process missing stdout")]
    MissingStdout,
    #[error("failed to write prompt to opencode stdin: {0}")]
    StdinWrite(#[source] std::io::Error),
    #[error("failed to read opencode stdout: {0}")]
    StdoutRead(#[source] std::io::Error),
    #[error("failed to wait for opencode process: {0}")]
    Wait(#[source] std::io::Error),
    #[error("failed to parse event JSON: {0}")]
    ParseEvent(#[from] serde_json::Error),
    #[error("opencode run exited unsuccessfully: {detail}")]
    ProcessFailed { detail: String },
    #[error("turn cancelled")]
    Cancelled,
    #[error("mutex poisoned")]
    Poisoned,
}

impl From<meeki_cli_process::ProcessError> for Error {
    fn from(value: meeki_cli_process::ProcessError) -> Self {
        match value {
            meeki_cli_process::ProcessError::MissingStdin => Self::MissingStdin,
            meeki_cli_process::ProcessError::MissingStdout => Self::MissingStdout,
            meeki_cli_process::ProcessError::StdinWrite(error) => Self::StdinWrite(error),
            meeki_cli_process::ProcessError::StdoutRead(error) => Self::StdoutRead(error),
            meeki_cli_process::ProcessError::Wait(error) => Self::Wait(error),
            meeki_cli_process::ProcessError::Kill(error) => Self::Kill(error),
            meeki_cli_process::ProcessError::ProcessFailed { detail } => {
                Self::ProcessFailed { detail }
            }
            meeki_cli_process::ProcessError::Cancelled => Self::Cancelled,
        }
    }
}
