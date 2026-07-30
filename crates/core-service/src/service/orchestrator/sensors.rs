//! Deterministic sensors for Judgment Spec.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use super::schemas::{Criterion, CriterionResult, SensorSpec};
use crate::error::{Result, ServiceError};

pub fn run_sensor(spec: &SensorSpec, default_cwd: &Path) -> Result<(bool, String, i32)> {
    if spec.argv.is_empty() {
        return Err(ServiceError::Validation("sensor argv empty".into()));
    }
    let cwd = spec
        .cwd
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| default_cwd.to_path_buf());

    let mut cmd = Command::new(&spec.argv[0]);
    if spec.argv.len() > 1 {
        cmd.args(&spec.argv[1..]);
    }
    cmd.current_dir(&cwd);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // timeout via wait_timeout pattern — use std with kill on timeout
    let mut child = cmd
        .spawn()
        .map_err(|e| ServiceError::Processing(format!("spawn sensor: {e}")))?;

    let timeout = Duration::from_millis(spec.timeout_ms.max(1));
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let code = status.code().unwrap_or(-1);
                let pass = spec.pass_exit_codes.contains(&code);
                let detail = format!("exit={code} cwd={}", cwd.display());
                return Ok((pass, detail, code));
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Ok((
                        false,
                        format!("sensor timeout after {}ms", spec.timeout_ms),
                        -1,
                    ));
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(e) => {
                return Err(ServiceError::Processing(format!("wait sensor: {e}")));
            }
        }
    }
}

pub fn evaluate_acceptance(
    criteria: &[Criterion],
    default_cwd: &Path,
) -> Result<Vec<CriterionResult>> {
    let mut out = Vec::new();
    for c in criteria {
        if !c.required {
            continue;
        }
        match c.kind.as_str() {
            "sensor" => {
                let Some(sensor) = &c.sensor else {
                    out.push(CriterionResult {
                        criterion_id: c.id.clone(),
                        pass: false,
                        evidence_ids: vec![],
                        detail: "missing sensor spec".into(),
                        unverified: true,
                    });
                    continue;
                };
                match run_sensor(sensor, default_cwd) {
                    Ok((pass, detail, code)) => {
                        let unverified = code == -1 && detail.contains("timeout");
                        out.push(CriterionResult {
                            criterion_id: c.id.clone(),
                            pass: pass && !unverified,
                            evidence_ids: vec![],
                            detail,
                            unverified,
                        });
                    }
                    Err(e) => {
                        out.push(CriterionResult {
                            criterion_id: c.id.clone(),
                            pass: false,
                            evidence_ids: vec![],
                            detail: e.to_string(),
                            unverified: true,
                        });
                    }
                }
            }
            "human" => {
                out.push(CriterionResult {
                    criterion_id: c.id.clone(),
                    pass: false,
                    evidence_ids: vec![],
                    detail: "awaiting human".into(),
                    unverified: false,
                });
            }
            "llm_judge" => {
                // M1: without verify role output, treat as unverified (not pass)
                out.push(CriterionResult {
                    criterion_id: c.id.clone(),
                    pass: false,
                    evidence_ids: vec![],
                    detail: "llm_judge pending verify artifact".into(),
                    unverified: true,
                });
            }
            other => {
                out.push(CriterionResult {
                    criterion_id: c.id.clone(),
                    pass: false,
                    evidence_ids: vec![],
                    detail: format!("unknown kind {other}"),
                    unverified: true,
                });
            }
        }
    }
    Ok(out)
}

/// Paths that makers must not mutate (sensor integrity).
pub fn immutable_paths_from_spec(criteria: &[Criterion]) -> Vec<String> {
    let mut paths = Vec::new();
    for c in criteria {
        paths.extend(c.immutable_paths.iter().cloned());
        if let Some(s) = &c.sensor {
            // treat script paths in argv as protected when they look like files
            for a in &s.argv {
                if a.contains('/') || a.ends_with(".rs") || a.ends_with(".sh") || a.ends_with(".ts")
                {
                    paths.push(a.clone());
                }
            }
        }
    }
    paths.sort();
    paths.dedup();
    paths
}

/// Compare protected path mtimes against a pre-maker snapshot.
/// Kept for sensor-integrity wiring on the maker/verify path (call sites TBD).
#[allow(dead_code)]
pub fn check_immutable_not_modified(
    protected: &[String],
    home: &Path,
    before: &std::collections::HashMap<String, u64>,
) -> std::result::Result<(), String> {
    for rel in protected {
        let p = if Path::new(rel).is_absolute() {
            PathBuf::from(rel)
        } else {
            home.join(rel)
        };
        let meta = match std::fs::metadata(&p) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Some(prev) = before.get(rel) {
            if mtime > *prev {
                return Err(format!("sensor integrity: protected path modified: {rel}"));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn true_sensor_passes() {
        let dir = tempdir().unwrap();
        let spec = SensorSpec {
            argv: vec!["true".into()],
            cwd: None,
            pass_exit_codes: vec![0],
            timeout_ms: 5_000,
        };
        let (pass, _, code) = run_sensor(&spec, dir.path()).unwrap();
        assert!(pass);
        assert_eq!(code, 0);
    }

    #[test]
    fn false_sensor_fails() {
        let dir = tempdir().unwrap();
        let spec = SensorSpec {
            argv: vec!["false".into()],
            cwd: None,
            pass_exit_codes: vec![0],
            timeout_ms: 5_000,
        };
        let (pass, _, _) = run_sensor(&spec, dir.path()).unwrap();
        assert!(!pass);
    }

    #[test]
    fn immutable_check_detects_mtime_increase() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("protected.txt");
        std::fs::write(&file, b"v1").unwrap();
        let mtime = std::fs::metadata(&file)
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        // Seed with a strictly older baseline so the current mtime fails.
        let before =
            std::collections::HashMap::from([("protected.txt".into(), mtime.saturating_sub(2))]);
        let err = check_immutable_not_modified(&["protected.txt".into()], dir.path(), &before)
            .expect_err("current mtime should exceed baseline");
        assert!(err.contains("protected path modified"));
    }
}
