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
    let Ok(canonical_root) = root.canonicalize() else {
        return false;
    };
    let Ok(canonical_path) = path.canonicalize() else {
        return false;
    };
    canonical_path.starts_with(canonical_root)
}

pub fn path_or_existing_parent_within_root(path: &Path, root: &Path) -> bool {
    let Ok(canonical_root) = root.canonicalize() else {
        return false;
    };

    if path.symlink_metadata().is_ok() {
        let Ok(canonical_path) = path.canonicalize() else {
            return false;
        };
        return canonical_path.starts_with(canonical_root);
    }

    let normalized_path = normalize_path_for_boundary(path);
    for ancestor in normalized_path.ancestors() {
        if ancestor.symlink_metadata().is_err() {
            continue;
        }
        let Ok(canonical_ancestor) = ancestor.canonicalize() else {
            return false;
        };
        return canonical_ancestor.starts_with(canonical_root);
    }

    false
}

#[cfg(test)]
mod tests {
    use super::{path_or_existing_parent_within_root, path_within_root};
    use std::fs;

    #[test]
    fn boundary_check_allows_normalized_child_paths() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("workspace");
        let src = root.join("src");
        fs::create_dir_all(&src).unwrap();
        let cargo = root.join("Cargo.toml");
        fs::write(&cargo, "").unwrap();

        assert!(path_within_root(&src.join("../Cargo.toml"), &root));
    }

    #[test]
    fn boundary_check_rejects_parent_escape() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("workspace");
        let outside = temp.path().join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();

        assert!(!path_within_root(&root.join("../outside"), &root));
    }

    #[test]
    fn write_boundary_allows_new_child_when_parent_exists() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("workspace");
        fs::create_dir_all(&root).unwrap();

        assert!(path_or_existing_parent_within_root(
            &root.join("new-file.txt"),
            &root
        ));
    }

    #[test]
    fn write_boundary_allows_new_nested_path_inside_root() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("workspace");
        fs::create_dir_all(&root).unwrap();

        assert!(path_or_existing_parent_within_root(
            &root.join("new/nested/file.txt"),
            &root
        ));
    }

    #[test]
    fn write_boundary_rejects_new_nested_path_after_parent_escape() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("workspace");
        let outside = temp.path().join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();

        assert!(!path_or_existing_parent_within_root(
            &root.join("../outside/new/file.txt"),
            &root
        ));
    }

    #[cfg(unix)]
    #[test]
    fn boundary_check_rejects_symlink_escape() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("workspace");
        let outside = temp.path().join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let outside_file = outside.join("secret.txt");
        fs::write(&outside_file, "secret").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("outside-link")).unwrap();

        assert!(!path_within_root(
            &root.join("outside-link/secret.txt"),
            &root
        ));
        assert!(!path_or_existing_parent_within_root(
            &root.join("outside-link/new-file.txt"),
            &root
        ));
    }

    #[cfg(unix)]
    #[test]
    fn write_boundary_rejects_existing_symlink_file_escape() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("workspace");
        let outside = temp.path().join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let outside_file = outside.join("secret.txt");
        fs::write(&outside_file, "secret").unwrap();
        std::os::unix::fs::symlink(&outside_file, root.join("secret-link.txt")).unwrap();

        assert!(!path_or_existing_parent_within_root(
            &root.join("secret-link.txt"),
            &root
        ));
    }
}
