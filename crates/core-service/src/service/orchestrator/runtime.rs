//! Pure Runtime gates (APP-048). No I/O.

use super::schemas::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompleteGateError {
    NoSpec,
    AcceptanceFailed { id: String },
    RejectionFired { id: String },
    HumanBlocked { id: String },
    Unverified { id: String },
    MakerSelfDeclare,
}

/// Completion gate: all required acceptance pass, no rejection, no human block, no unverified.
pub fn can_complete(
    spec: &JudgmentSpecBody,
    criterion_results: &[CriterionResult],
    allow_maker_self_declare: bool,
) -> Result<(), CompleteGateError> {
    if allow_maker_self_declare {
        return Err(CompleteGateError::MakerSelfDeclare);
    }
    if spec.acceptance.is_empty() {
        return Err(CompleteGateError::NoSpec);
    }

    for c in &spec.acceptance {
        if !c.required {
            continue;
        }
        let Some(r) = criterion_results.iter().find(|r| r.criterion_id == c.id) else {
            return Err(CompleteGateError::Unverified { id: c.id.clone() });
        };
        if r.unverified {
            return Err(CompleteGateError::Unverified { id: c.id.clone() });
        }
        if c.kind == "human" && !r.pass {
            return Err(CompleteGateError::HumanBlocked { id: c.id.clone() });
        }
        if !r.pass {
            return Err(CompleteGateError::AcceptanceFailed { id: c.id.clone() });
        }
    }

    for c in &spec.rejection {
        if let Some(r) = criterion_results.iter().find(|r| r.criterion_id == c.id) {
            if r.pass {
                // rejection criterion "pass" means the bad condition was detected
                return Err(CompleteGateError::RejectionFired { id: c.id.clone() });
            }
        }
    }

    Ok(())
}

pub fn requires_user_confirm(spec: &JudgmentSpecBody) -> bool {
    if matches!(spec.risk_tier.as_str(), "high" | "critical") {
        return true;
    }
    let has_sensor = spec
        .acceptance
        .iter()
        .any(|c| c.required && c.kind == "sensor");
    for c in &spec.acceptance {
        if !c.required {
            continue;
        }
        if c.kind == "human" {
            return true;
        }
        if c.kind == "llm_judge" {
            // confirm if any required llm_judge exists (M13 tightened)
            return true;
        }
        if c.kind == "llm_judge" && !has_sensor {
            return true;
        }
    }
    false
}

/// True when `next` weakens `prev` (drops required acceptance or softens risk).
pub fn spec_weakens(prev: &JudgmentSpecBody, next: &JudgmentSpecBody) -> bool {
    let risk_rank = |t: &str| match t {
        "critical" => 3,
        "high" => 2,
        "medium" => 1,
        _ => 0,
    };
    if risk_rank(&next.risk_tier) < risk_rank(&prev.risk_tier) {
        return true;
    }
    for c in &prev.acceptance {
        if !c.required {
            continue;
        }
        let still = next.acceptance.iter().any(|n| n.id == c.id && n.required);
        if !still {
            return true;
        }
    }
    false
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BudgetCheck {
    Ok,
    Iterations,
    Wall,
    Makers,
}

pub fn check_budget(
    budget: &Budget,
    iterations_used: u32,
    maker_invocations: u32,
    elapsed_ms: u64,
) -> BudgetCheck {
    if iterations_used >= budget.max_iterations {
        return BudgetCheck::Iterations;
    }
    if maker_invocations >= budget.max_maker_invocations {
        return BudgetCheck::Makers;
    }
    if elapsed_ms >= budget.max_wall_ms {
        return BudgetCheck::Wall;
    }
    BudgetCheck::Ok
}

pub fn progress_key(failing_criterion_ids: &[String], sensor_signatures: &[String]) -> String {
    let mut ids = failing_criterion_ids.to_vec();
    ids.sort();
    let mut sigs = sensor_signatures.to_vec();
    sigs.sort();
    format!("{}|{}", ids.join(","), sigs.join(","))
}

pub fn update_progress_streak(prev_key: Option<&str>, prev_streak: u32, new_key: &str) -> u32 {
    match prev_key {
        Some(p) if p == new_key && !new_key.is_empty() => prev_streak.saturating_add(1),
        _ => 1,
    }
}

pub const NO_PROGRESS_THRESHOLD: u32 = 3;

/// Resolve effective mode from request + optional proposal (M6b demote).
pub fn resolve_effective_mode(
    requested: OrchMode,
    proposal: Option<&ModeProposal>,
) -> Result<(EffectiveMode, String), String> {
    match requested {
        OrchMode::Loop => Ok((EffectiveMode::Loop, "user override".into())),
        OrchMode::Graph => {
            if let Some(p) = proposal {
                if let Some(g) = &p.graph {
                    if let Err(e) = super::graph_compile::compile_graph(g) {
                        return Ok((
                            EffectiveMode::Loop,
                            format!("graph compile failed, demoted to loop: {e}"),
                        ));
                    }
                } else if p.named_units.len() < 2 && p.topology_hint.as_deref() != Some("diamond") {
                    return Ok((
                        EffectiveMode::Loop,
                        "graph requested without compilable topology; demoted to loop".into(),
                    ));
                }
            }
            Ok((
                EffectiveMode::Graph,
                proposal
                    .map(|p| p.reason.clone())
                    .unwrap_or_else(|| "user forced graph".into()),
            ))
        }
        OrchMode::Auto => {
            let Some(p) = proposal else {
                return Err("auto mode requires mode_proposal.json".into());
            };
            match p.mode {
                EffectiveMode::Loop => Ok((EffectiveMode::Loop, p.reason.clone())),
                EffectiveMode::Graph => {
                    if let Some(g) = &p.graph {
                        if let Err(e) = super::graph_compile::compile_graph(g) {
                            return Ok((EffectiveMode::Loop, format!("auto graph demoted: {e}")));
                        }
                        Ok((EffectiveMode::Graph, p.reason.clone()))
                    } else if p.topology_hint.as_deref() == Some("diamond")
                        && p.named_units.len() >= 2
                    {
                        Ok((EffectiveMode::Graph, p.reason.clone()))
                    } else {
                        Ok((
                            EffectiveMode::Loop,
                            format!("auto preferred loop (no valid graph): {}", p.reason),
                        ))
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sensor_crit(id: &str) -> Criterion {
        Criterion {
            id: id.into(),
            description: "d".into(),
            kind: "sensor".into(),
            required: true,
            sensor: Some(SensorSpec {
                argv: vec!["true".into()],
                cwd: None,
                pass_exit_codes: vec![0],
                timeout_ms: 1000,
            }),
            falsify: None,
            evidence_required: vec![],
            immutable_paths: vec!["tests/foo.rs".into()],
            sole_source: Some("sensor".into()),
        }
    }

    fn base_spec() -> JudgmentSpecBody {
        JudgmentSpecBody {
            goal_summary: "g".into(),
            risk_tier: "low".into(),
            acceptance: vec![sensor_crit("c1")],
            rejection: vec![],
            judgment_order: vec!["sensor".into(), "llm_judge".into(), "human".into()],
        }
    }

    #[test]
    fn complete_requires_all_acceptance() {
        let spec = base_spec();
        assert!(can_complete(&spec, &[], false).is_err());
        assert!(can_complete(
            &spec,
            &[CriterionResult {
                criterion_id: "c1".into(),
                pass: true,
                evidence_ids: vec!["e1".into()],
                detail: "ok".into(),
                unverified: false,
            }],
            false
        )
        .is_ok());
    }

    #[test]
    fn unverified_blocks_complete() {
        let spec = base_spec();
        let err = can_complete(
            &spec,
            &[CriterionResult {
                criterion_id: "c1".into(),
                pass: false,
                evidence_ids: vec![],
                detail: "timeout".into(),
                unverified: true,
            }],
            false,
        )
        .unwrap_err();
        assert!(matches!(err, CompleteGateError::Unverified { .. }));
    }

    #[test]
    fn maker_self_declare_banned() {
        let spec = base_spec();
        assert!(matches!(
            can_complete(&spec, &[], true),
            Err(CompleteGateError::MakerSelfDeclare)
        ));
    }

    #[test]
    fn rejection_blocks_complete() {
        let mut spec = base_spec();
        spec.rejection.push(Criterion {
            id: "bad".into(),
            description: "no".into(),
            kind: "sensor".into(),
            required: true,
            sensor: None,
            falsify: None,
            evidence_required: vec![],
            immutable_paths: vec![],
            sole_source: None,
        });
        let err = can_complete(
            &spec,
            &[
                CriterionResult {
                    criterion_id: "c1".into(),
                    pass: true,
                    evidence_ids: vec![],
                    detail: String::new(),
                    unverified: false,
                },
                CriterionResult {
                    criterion_id: "bad".into(),
                    pass: true, // rejection detected
                    evidence_ids: vec![],
                    detail: String::new(),
                    unverified: false,
                },
            ],
            false,
        )
        .unwrap_err();
        assert!(matches!(err, CompleteGateError::RejectionFired { .. }));
    }

    #[test]
    fn human_confirm_for_llm_judge() {
        let mut spec = base_spec();
        spec.acceptance.push(Criterion {
            id: "h".into(),
            description: "human".into(),
            kind: "llm_judge".into(),
            required: true,
            sensor: None,
            falsify: None,
            evidence_required: vec![],
            immutable_paths: vec![],
            sole_source: Some("llm_judge".into()),
        });
        assert!(requires_user_confirm(&spec));
    }

    #[test]
    fn weaken_detects_dropped_criterion() {
        let prev = base_spec();
        let mut next = base_spec();
        next.acceptance.clear();
        assert!(spec_weakens(&prev, &next));
    }

    #[test]
    fn budget_wall() {
        let b = Budget {
            max_iterations: 8,
            max_wall_ms: 100,
            max_maker_invocations: 12,
            max_spec_versions: 3,
        };
        assert_eq!(check_budget(&b, 0, 0, 100), BudgetCheck::Wall);
    }

    #[test]
    fn no_progress_streak() {
        assert_eq!(update_progress_streak(Some("a"), 2, "a"), 3);
        assert_eq!(update_progress_streak(Some("a"), 2, "b"), 1);
    }

    #[test]
    fn auto_demotes_bad_graph() {
        let proposal = ModeProposal {
            mode: EffectiveMode::Graph,
            reason: "try graph".into(),
            plan_complexity: "low".into(),
            topology_hint: None,
            graph: Some(CompiledGraph {
                nodes: vec![],
                edges: vec![],
                entry: vec![],
            }),
            named_units: vec![],
        };
        let (mode, reason) = resolve_effective_mode(OrchMode::Auto, Some(&proposal)).unwrap();
        assert_eq!(mode, EffectiveMode::Loop);
        assert!(reason.contains("demot") || reason.contains("loop") || reason.contains("compile"));
    }

    #[test]
    fn user_loop_skips_proposal() {
        let (mode, _) = resolve_effective_mode(OrchMode::Loop, None).unwrap();
        assert_eq!(mode, EffectiveMode::Loop);
    }

    #[test]
    fn role_header_distinguishes_same_brand() {
        let a = compose_role_header(OrchRole::Maker, "Codex", Some("iter 1"), "active");
        let b = compose_role_header(OrchRole::Verify, "Codex", None, "active");
        assert_ne!(a, b);
        assert!(a.contains("Maker"));
        assert!(b.contains("Verify"));
    }
}
