use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum VersionType {
    Stable,
    Rc,
    Beta,
    Alpha,
}

impl fmt::Display for VersionType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            VersionType::Stable => write!(f, "stable"),
            VersionType::Rc => write!(f, "rc"),
            VersionType::Beta => write!(f, "beta"),
            VersionType::Alpha => write!(f, "alpha"),
        }
    }
}

pub fn detect_version_type(version: &str) -> VersionType {
    if version.contains("-rc.") {
        VersionType::Rc
    } else if version.contains("-beta.") {
        VersionType::Beta
    } else if version.contains("-alpha.") {
        VersionType::Alpha
    } else {
        VersionType::Stable
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_version_type() {
        assert_eq!(detect_version_type("1.0.0"), VersionType::Stable);
        assert_eq!(detect_version_type("1.0.0-rc.1"), VersionType::Rc);
        assert_eq!(detect_version_type("1.0.0-beta.1"), VersionType::Beta);
        assert_eq!(detect_version_type("1.0.0-alpha.1"), VersionType::Alpha);
    }

    #[test]
    fn test_detect_version_type_with_higher_numbers() {
        assert_eq!(detect_version_type("1.1.0-rc.10"), VersionType::Rc);
        assert_eq!(detect_version_type("1.1.1-beta.5"), VersionType::Beta);
        assert_eq!(detect_version_type("2.0.0-alpha.100"), VersionType::Alpha);
    }

    #[test]
    fn test_detect_version_type_current_version() {
        // Test with the actual current version from the project
        assert_eq!(detect_version_type("1.1.0-rc.7"), VersionType::Rc);
    }

    #[test]
    fn test_version_type_display() {
        assert_eq!(VersionType::Stable.to_string(), "stable");
        assert_eq!(VersionType::Rc.to_string(), "rc");
        assert_eq!(VersionType::Beta.to_string(), "beta");
        assert_eq!(VersionType::Alpha.to_string(), "alpha");
    }

    #[test]
    fn test_version_type_equality() {
        assert_eq!(VersionType::Stable, VersionType::Stable);
        assert_eq!(VersionType::Rc, VersionType::Rc);
        assert_ne!(VersionType::Rc, VersionType::Beta);
        assert_ne!(VersionType::Stable, VersionType::Rc);
    }
}
