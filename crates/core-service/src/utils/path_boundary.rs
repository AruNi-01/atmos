use std::path::{Component, Path, PathBuf};

pub fn normalize_path_for_boundary(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Normal(segment) => normalized.push(segment),
        }
    }
    normalized
}

pub fn path_within_root(path: &Path, root: &Path) -> bool {
    normalize_path_for_boundary(path).starts_with(normalize_path_for_boundary(root))
}

#[cfg(test)]
mod tests {
    use super::path_within_root;
    use std::path::Path;

    #[test]
    fn boundary_check_allows_normalized_child_paths() {
        assert!(path_within_root(
            Path::new("/tmp/workspace/src/../Cargo.toml"),
            Path::new("/tmp/workspace")
        ));
    }

    #[test]
    fn boundary_check_rejects_parent_escape() {
        assert!(!path_within_root(
            Path::new("/tmp/workspace/../outside"),
            Path::new("/tmp/workspace")
        ));
    }
}
