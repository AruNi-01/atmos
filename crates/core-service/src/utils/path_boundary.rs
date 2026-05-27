use std::path::{Component, Path, PathBuf};

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

    let components: Vec<_> = path.components().collect();
    let mut current = PathBuf::new();

    for (idx, component) in components.iter().enumerate() {
        match component {
            Component::Prefix(prefix) => current.push(prefix.as_os_str()),
            Component::RootDir => current.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                let Ok(canonical_current) = current.canonicalize() else {
                    return false;
                };
                let Some(parent) = canonical_current.parent() else {
                    return false;
                };
                if canonical_current.starts_with(&canonical_root)
                    && !parent.starts_with(&canonical_root)
                {
                    return false;
                }
                current = parent.to_path_buf();
            }
            Component::Normal(segment) => {
                let candidate = current.join(segment);
                if candidate.symlink_metadata().is_ok() {
                    let Ok(canonical_candidate) = candidate.canonicalize() else {
                        return false;
                    };
                    if current.canonicalize().is_ok_and(|canonical_current| {
                        canonical_current.starts_with(&canonical_root)
                    }) && !canonical_candidate.starts_with(&canonical_root)
                    {
                        return false;
                    }
                    current = canonical_candidate;
                } else {
                    let Ok(canonical_current) = current.canonicalize() else {
                        return false;
                    };
                    return canonical_current.starts_with(&canonical_root)
                        && components[idx..]
                            .iter()
                            .all(|part| matches!(part, Component::Normal(_) | Component::CurDir));
                }
            }
        }
    }

    current
        .canonicalize()
        .is_ok_and(|canonical_current| canonical_current.starts_with(canonical_root))
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

    #[test]
    fn write_boundary_allows_existing_parent_segments_inside_root() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("workspace");
        let src = root.join("src");
        fs::create_dir_all(&src).unwrap();

        assert!(path_or_existing_parent_within_root(
            &src.join("../new/file.txt"),
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
        assert!(!path_or_existing_parent_within_root(
            &root.join("outside-link/../new-file.txt"),
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
