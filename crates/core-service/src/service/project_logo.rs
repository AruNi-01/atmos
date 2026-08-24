use core_engine::{GitEngine, GithubEngine};
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_WALK_DEPTH: usize = 8;
const MAX_FILES_VISITED: usize = 8_000;
const MAX_LOGO_BYTES: u64 = 2 * 1024 * 1024;

const SKIP_DIR_NAMES: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".nuxt",
    ".output",
    ".turbo",
    ".cache",
    ".yarn",
    ".pnpm-store",
    ".venv",
    ".idea",
    ".vscode",
    ".gradle",
    "node_modules",
    "bower_components",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    "vendor",
    "Pods",
    "DerivedData",
    "__pycache__",
    "venv",
    "tmp",
    "temp",
    "logs",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LogoTier {
    Primary,
    Fallback,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct LogoScore {
    tier: LogoTier,
    name_rank: u8,
    ext_rank: u8,
    depth: u8,
}

impl LogoScore {
    fn cmp_best(self, other: Self) -> Ordering {
        fn tier_rank(tier: LogoTier) -> u8 {
            match tier {
                LogoTier::Primary => 0,
                LogoTier::Fallback => 1,
            }
        }
        tier_rank(self.tier)
            .cmp(&tier_rank(other.tier))
            .then(self.name_rank.cmp(&other.name_rank))
            .then(self.ext_rank.cmp(&other.ext_rank))
            .then(self.depth.cmp(&other.depth))
    }

    fn is_best_possible(self) -> bool {
        self.tier == LogoTier::Primary
            && self.name_rank == 0
            && self.ext_rank == 0
            && self.depth == 0
    }
}

/// Detect a project logo when a repo is first imported.
///
/// Order: local files named like website logos/icons (any folder) → GitHub
/// owner/org avatar if `origin` is GitHub → weaker local icons → none.
pub fn detect_project_logo(root: &Path) -> Option<String> {
    detect_project_logo_with(&GitEngine::new(), root)
}

fn detect_project_logo_with(git: &GitEngine, root: &Path) -> Option<String> {
    if !root.is_dir() {
        return None;
    }

    let (primary, fallback) = scan_local_logos(root);
    if let Some(path) = primary {
        return Some(path_to_logo_value(&path));
    }
    if let Some(url) = github_owner_avatar_url(git, root) {
        return Some(url);
    }
    fallback.map(|path| path_to_logo_value(&path))
}

fn path_to_logo_value(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

fn github_owner_avatar_url(git: &GitEngine, root: &Path) -> Option<String> {
    let remote = git.get_remote_url(root).ok()?;
    let remote = remote.trim();
    if remote.is_empty() {
        return None;
    }
    let (owner, _repo) = GithubEngine::parse_github_remote(remote)?;
    if !is_github_owner(&owner) {
        return None;
    }
    Some(format!("https://github.com/{owner}.png?size=64"))
}

fn is_github_owner(owner: &str) -> bool {
    let len = owner.len();
    (1..=39).contains(&len)
        && owner
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
}

fn scan_local_logos(root: &Path) -> (Option<PathBuf>, Option<PathBuf>) {
    let mut primary: Option<(LogoScore, PathBuf)> = None;
    let mut fallback: Option<(LogoScore, PathBuf)> = None;
    let mut files_visited = 0usize;
    let mut stop = false;
    walk_dir(
        root,
        0,
        &mut files_visited,
        &mut stop,
        &mut primary,
        &mut fallback,
    );
    (
        primary.map(|(_, path)| path),
        fallback.map(|(_, path)| path),
    )
}

fn walk_dir(
    dir: &Path,
    depth: usize,
    files_visited: &mut usize,
    stop: &mut bool,
    primary: &mut Option<(LogoScore, PathBuf)>,
    fallback: &mut Option<(LogoScore, PathBuf)>,
) {
    if *stop || depth > MAX_WALK_DEPTH {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let mut subdirs = Vec::new();
    for entry in entries {
        if *stop || *files_visited >= MAX_FILES_VISITED {
            *stop = true;
            return;
        }
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with('.') || should_skip_dir(&name) {
                continue;
            }
            subdirs.push(path);
            continue;
        }
        if !meta.is_file() {
            continue;
        }
        *files_visited += 1;
        if meta.len() == 0 || meta.len() > MAX_LOGO_BYTES {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Some(score) = score_logo_file(file_name, depth) else {
            continue;
        };
        match score.tier {
            LogoTier::Primary => consider_candidate(primary, score, path),
            LogoTier::Fallback => consider_candidate(fallback, score, path),
        }
        if primary
            .as_ref()
            .is_some_and(|(best, _)| best.is_best_possible())
        {
            *stop = true;
            return;
        }
    }
    for subdir in subdirs {
        walk_dir(&subdir, depth + 1, files_visited, stop, primary, fallback);
        if *stop {
            return;
        }
    }
}

fn consider_candidate(slot: &mut Option<(LogoScore, PathBuf)>, score: LogoScore, path: PathBuf) {
    match slot {
        Some((best_score, best_path)) => match score.cmp_best(*best_score) {
            Ordering::Less => {
                *best_score = score;
                *best_path = path;
            }
            Ordering::Equal if path.to_string_lossy() < best_path.to_string_lossy() => {
                *best_path = path;
            }
            _ => {}
        },
        None => *slot = Some((score, path)),
    }
}

fn should_skip_dir(name: &str) -> bool {
    SKIP_DIR_NAMES
        .iter()
        .any(|skip| name.eq_ignore_ascii_case(skip))
}

fn score_logo_file(file_name: &str, depth: usize) -> Option<LogoScore> {
    let ext = file_extension(file_name)?.to_ascii_lowercase();
    let ext_rank = extension_rank(&ext)?;
    let stem = file_stem(file_name)?;
    let (tier, name_rank) = classify_stem(stem, &ext)?;
    Some(LogoScore {
        tier,
        name_rank,
        ext_rank,
        depth: depth.min(u8::MAX as usize) as u8,
    })
}

fn classify_stem(stem: &str, ext: &str) -> Option<(LogoTier, u8)> {
    let normalized = normalize_stem(stem);
    if normalized == "logo" || normalized.starts_with("logo-") {
        return Some((LogoTier::Primary, 0));
    }
    if normalized == "icon" {
        return Some((LogoTier::Primary, 1));
    }
    if normalized == "favicon" || normalized.starts_with("favicon-") {
        if ext == "ico" {
            return Some((LogoTier::Fallback, 0));
        }
        return Some((LogoTier::Primary, 2));
    }
    if normalized == "apple-touch-icon" || normalized == "apple-icon" {
        return Some((LogoTier::Fallback, 1));
    }
    if normalized == "android-chrome" {
        return Some((LogoTier::Fallback, 2));
    }
    None
}

fn normalize_stem(stem: &str) -> String {
    let lower = stem.to_lowercase();
    match strip_trailing_dimension(&lower) {
        Some(stripped) => stripped.to_string(),
        None => lower,
    }
}

fn strip_trailing_dimension(stem: &str) -> Option<&str> {
    let (head, tail) = stem.rsplit_once('-')?;
    if is_dimension_token(tail) {
        Some(head)
    } else {
        None
    }
}

fn is_dimension_token(token: &str) -> bool {
    if token.is_empty() || token.len() > 9 {
        return false;
    }
    if token.chars().all(|ch| ch.is_ascii_digit()) {
        return true;
    }
    let mut parts = token.split('x');
    let Some(width) = parts.next() else {
        return false;
    };
    let Some(height) = parts.next() else {
        return false;
    };
    parts.next().is_none()
        && !width.is_empty()
        && !height.is_empty()
        && width.chars().all(|ch| ch.is_ascii_digit())
        && height.chars().all(|ch| ch.is_ascii_digit())
}

fn file_stem(file_name: &str) -> Option<&str> {
    let dot = file_name.rfind('.')?;
    if dot == 0 {
        return None;
    }
    Some(&file_name[..dot])
}

fn file_extension(file_name: &str) -> Option<&str> {
    let dot = file_name.rfind('.')?;
    if dot == 0 || dot + 1 >= file_name.len() {
        return None;
    }
    Some(&file_name[dot + 1..])
}

fn extension_rank(ext: &str) -> Option<u8> {
    Some(match ext.to_ascii_lowercase().as_str() {
        "svg" => 0,
        "png" | "webp" | "avif" => 1,
        "gif" => 2,
        "jpg" | "jpeg" => 3,
        "ico" | "bmp" => 4,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn write_file(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("mkdir");
        }
        fs::write(path, contents).expect("write");
    }

    fn git(dir: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .expect("git");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn finds_logo_by_filename_in_unknown_folder() {
        let root = tempfile::tempdir().expect("tempdir");
        write_file(
            &root.path().join("apps/marketing/static/logo.svg"),
            "<svg/>",
        );
        write_file(&root.path().join("src/assets/icon.png"), "png");
        let detected = detect_project_logo(root.path()).expect("logo");
        assert!(detected.ends_with("logo.svg"), "{detected}");
    }

    #[test]
    fn prefers_shallower_logo_over_nested_icon() {
        let root = tempfile::tempdir().expect("tempdir");
        write_file(&root.path().join("logo.png"), "png");
        write_file(&root.path().join("deep/nested/public/icon.svg"), "<svg/>");
        let detected = detect_project_logo(root.path()).expect("logo");
        assert!(detected.ends_with("logo.png"), "{detected}");
    }

    #[test]
    fn ignores_vendor_directories() {
        let root = tempfile::tempdir().expect("tempdir");
        write_file(&root.path().join("node_modules/pkg/logo.svg"), "<svg/>");
        write_file(&root.path().join("target/logo.png"), "png");
        assert_eq!(detect_project_logo(root.path()), None);
    }

    #[test]
    fn skips_non_image_icon_files() {
        let root = tempfile::tempdir().expect("tempdir");
        write_file(&root.path().join("icon.ts"), "export {}");
        write_file(&root.path().join("logo.json"), "{}");
        assert_eq!(detect_project_logo(root.path()), None);
    }

    #[test]
    fn uses_github_owner_avatar_when_no_local_logo() {
        let root = tempfile::tempdir().expect("tempdir");
        git(root.path(), &["init"]);
        git(
            root.path(),
            &[
                "remote",
                "add",
                "origin",
                "git@github.com:Acme-Org/widgets.git",
            ],
        );
        assert_eq!(
            detect_project_logo(root.path()).as_deref(),
            Some("https://github.com/Acme-Org.png?size=64")
        );
    }

    #[test]
    fn local_logo_wins_over_github() {
        let root = tempfile::tempdir().expect("tempdir");
        write_file(&root.path().join("website/logo.webp"), "webp");
        git(root.path(), &["init"]);
        git(
            root.path(),
            &[
                "remote",
                "add",
                "origin",
                "https://github.com/Acme-Org/widgets.git",
            ],
        );
        let detected = detect_project_logo(root.path()).expect("logo");
        assert!(detected.ends_with("logo.webp"), "{detected}");
    }

    #[test]
    fn github_wins_over_weak_favicon_ico() {
        let root = tempfile::tempdir().expect("tempdir");
        write_file(&root.path().join("favicon.ico"), "ico");
        git(root.path(), &["init"]);
        git(
            root.path(),
            &[
                "remote",
                "add",
                "origin",
                "https://github.com/Acme-Org/widgets.git",
            ],
        );
        assert_eq!(
            detect_project_logo(root.path()).as_deref(),
            Some("https://github.com/Acme-Org.png?size=64")
        );
    }

    #[test]
    fn fallback_uses_favicon_ico_without_github() {
        let root = tempfile::tempdir().expect("tempdir");
        write_file(
            &root.path().join("whatever/apple-touch-icon-180x180.png"),
            "png",
        );
        let detected = detect_project_logo(root.path()).expect("fallback");
        assert!(
            detected.ends_with("apple-touch-icon-180x180.png"),
            "{detected}"
        );
    }

    #[test]
    fn empty_project_has_no_logo() {
        let root = tempfile::tempdir().expect("tempdir");
        assert_eq!(detect_project_logo(root.path()), None);
    }
}
