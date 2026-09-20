//! Cheap directory helpers for host session listing.
//!
//! Walk metadata only. Do not parse transcript bodies here.

use std::path::Path;

pub fn dir_nonempty(path: &Path) -> bool {
    let Ok(mut entries) = std::fs::read_dir(path) else {
        return false;
    };
    entries.next().is_some()
}

pub fn has_extension(root: &Path, extension: &str, max_depth: usize) -> bool {
    walk_matches(root, max_depth, &mut |path| {
        path.is_file()
            && path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case(extension))
    })
}

pub fn walk_matches(root: &Path, max_depth: usize, pred: &mut impl FnMut(&Path) -> bool) -> bool {
    if pred(root) {
        return true;
    }
    walk_dir(root, 1, max_depth, pred)
}

fn walk_dir(
    dir: &Path,
    depth: usize,
    max_depth: usize,
    pred: &mut impl FnMut(&Path) -> bool,
) -> bool {
    if depth > max_depth {
        return false;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if pred(&path) {
            return true;
        }
        if depth < max_depth
            && path.is_dir()
            && !path.is_symlink()
            && walk_dir(&path, depth + 1, max_depth, pred)
        {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn has_extension_finds_nested_jsonl() {
        let tmp = tempfile::tempdir().unwrap();
        let nested = tmp.path().join("proj").join("sess");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("a.jsonl"), b"").unwrap();
        assert!(has_extension(tmp.path(), "jsonl", 4));
        assert!(!has_extension(tmp.path(), "json", 4));
        assert!(!dir_nonempty(&tmp.path().join("missing")));
    }
}
