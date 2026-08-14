use std::path::PathBuf;

const DATA_DIR: &str = "permission-access";

pub(crate) fn data_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("ATMOS_PERMISSION_ACCESS_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    dirs::home_dir().map(|home| home.join(".atmos").join("data").join(DATA_DIR))
}

pub(crate) fn consent_path() -> Option<PathBuf> {
    data_dir().map(|dir| dir.join("consent.json"))
}
