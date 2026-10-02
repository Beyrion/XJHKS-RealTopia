use chrono::Utc;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;

const LOG_FILE: &str = "realtopia-backend.log";
const LOG_FILE_OLD: &str = "realtopia-backend.log.1";
const MAX_LOG_BYTES: u64 = 512 * 1024;

fn log_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(LOG_FILE))
}

fn rotate(path: &Path) -> Result<(), String> {
    if path.metadata().map(|value| value.len()).unwrap_or(0) < MAX_LOG_BYTES {
        return Ok(());
    }
    let old = path.with_file_name(LOG_FILE_OLD);
    if old.exists() {
        fs::remove_file(&old).map_err(|error| error.to_string())?;
    }
    fs::rename(path, old).map_err(|error| error.to_string())
}

pub fn log(app: &tauri::AppHandle, category: &str, event: &str, detail: &str) {
    let Ok(path) = log_path(app) else { return };
    if rotate(&path).is_err() {
        return;
    }
    let sanitized = detail.replace(['\r', '\n'], " ");
    let line = format!(
        "{} [{}] {} {}\n",
        Utc::now().to_rfc3339(),
        category,
        event,
        sanitized
    );
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

pub fn tail(app: &tauri::AppHandle, max_lines: usize) -> Result<String, String> {
    let path = log_path(app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let lines: Vec<_> = content.lines().collect();
    Ok(lines[lines.len().saturating_sub(max_lines.min(500))..].join("\n"))
}
