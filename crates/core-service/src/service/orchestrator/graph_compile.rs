//! Graph compile + join readiness (APP-048).

use std::collections::{HashMap, HashSet};

use super::schemas::{CompiledGraph, GraphEdge, GraphNode};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileError(pub String);

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

const MAX_NODES: usize = 32;
const MAX_FANOUT: usize = 4;

pub fn compile_graph(graph: &CompiledGraph) -> Result<CompiledGraph, CompileError> {
    if graph.nodes.is_empty() {
        return Err(CompileError("graph has no nodes".into()));
    }
    if graph.nodes.len() > MAX_NODES {
        return Err(CompileError(format!("too many nodes (max {MAX_NODES})")));
    }

    let ids: HashSet<_> = graph.nodes.iter().map(|n| n.id.as_str()).collect();
    if ids.len() != graph.nodes.len() {
        return Err(CompileError("duplicate node ids".into()));
    }

    for e in &graph.edges {
        if e.kind != "control" && e.kind != "data" {
            return Err(CompileError(format!("edge {} invalid kind", e.id)));
        }
        if !ids.contains(e.from.as_str()) || !ids.contains(e.to.as_str()) {
            return Err(CompileError(format!("edge {} unbound endpoints", e.id)));
        }
    }

    // Detect cycles without max_cycles on back-edges
    if has_cycle_without_max(&graph.nodes, &graph.edges) {
        return Err(CompileError(
            "cycle detected without max_cycles on edge".into(),
        ));
    }

    // Multi-writer on home without isolation
    let writers: Vec<_> = graph
        .nodes
        .iter()
        .filter(|n| n.kind == "maker" && n.writes && n.isolation != "worktree")
        .collect();
    if writers.len() > 1 {
        // concurrent writers without worktree isolation
        return Err(CompileError(
            "multiple writing makers without isolation=worktree on home tree".into(),
        ));
    }

    // Fan-out width
    let mut out_deg: HashMap<&str, usize> = HashMap::new();
    for e in &graph.edges {
        if e.kind == "control" {
            *out_deg.entry(e.from.as_str()).or_default() += 1;
        }
    }
    for (from, deg) in out_deg {
        if deg > MAX_FANOUT {
            return Err(CompileError(format!(
                "fan-out from {from} exceeds {MAX_FANOUT}"
            )));
        }
    }

    let mut entry = graph.entry.clone();
    if entry.is_empty() {
        // nodes with no inbound control edges
        let mut inbound = HashSet::new();
        for e in &graph.edges {
            if e.kind == "control" {
                inbound.insert(e.to.as_str());
            }
        }
        entry = graph
            .nodes
            .iter()
            .filter(|n| !inbound.contains(n.id.as_str()))
            .map(|n| n.id.clone())
            .collect();
    }
    if entry.is_empty() {
        return Err(CompileError("no entry nodes".into()));
    }
    for e in &entry {
        if !ids.contains(e.as_str()) {
            return Err(CompileError(format!("entry {e} unknown")));
        }
    }

    // Reachability from entry via control edges
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
    for e in &graph.edges {
        if e.kind == "control" {
            adj.entry(e.from.as_str()).or_default().push(e.to.as_str());
        }
    }
    let mut seen = HashSet::new();
    let mut stack: Vec<&str> = entry.iter().map(|s| s.as_str()).collect();
    while let Some(n) = stack.pop() {
        if !seen.insert(n) {
            continue;
        }
        if let Some(next) = adj.get(n) {
            stack.extend(next.iter().copied());
        }
    }
    for n in &graph.nodes {
        if !seen.contains(n.id.as_str()) {
            return Err(CompileError(format!("unreachable node {}", n.id)));
        }
    }

    Ok(CompiledGraph {
        nodes: graph.nodes.clone(),
        edges: graph.edges.clone(),
        entry,
    })
}

fn has_cycle_without_max(nodes: &[GraphNode], edges: &[GraphEdge]) -> bool {
    let ids: HashSet<_> = nodes.iter().map(|n| n.id.as_str()).collect();
    let mut adj: HashMap<&str, Vec<(&str, bool)>> = HashMap::new();
    for e in edges {
        if e.kind != "control" {
            continue;
        }
        if !ids.contains(e.from.as_str()) {
            continue;
        }
        let allows_cycle = e.max_cycles.unwrap_or(0) >= 1;
        adj.entry(e.from.as_str())
            .or_default()
            .push((e.to.as_str(), allows_cycle));
    }

    #[derive(Clone, Copy)]
    enum Color {
        White,
        Gray,
        Black,
    }
    let mut color: HashMap<&str, Color> = ids.iter().map(|id| (*id, Color::White)).collect();

    fn dfs<'a>(
        u: &'a str,
        color: &mut HashMap<&'a str, Color>,
        adj: &HashMap<&'a str, Vec<(&'a str, bool)>>,
    ) -> bool {
        color.insert(u, Color::Gray);
        if let Some(nexts) = adj.get(u) {
            for (v, allows_cycle) in nexts {
                match color.get(v).copied().unwrap_or(Color::White) {
                    Color::Gray if !*allows_cycle => return true,
                    Color::White => {
                        if dfs(v, color, adj) {
                            return true;
                        }
                    }
                    _ => {}
                }
            }
        }
        color.insert(u, Color::Black);
        false
    }

    let id_list: Vec<&str> = ids.iter().copied().collect();
    for id in id_list {
        if matches!(color.get(id), Some(Color::White)) {
            if dfs(id, &mut color, &adj) {
                return true;
            }
        }
    }
    false
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeTerminal {
    Succeeded,
    Failed,
    Cancelled,
    TimedOut,
    Skipped,
    Running,
}

/// Join readiness: all required inbound must be terminal; fail-closed on fail/hang/missing.
pub fn join_ready(
    node_id: &str,
    edges: &[GraphEdge],
    states: &HashMap<String, NodeTerminal>,
) -> Result<(), String> {
    let required_preds: Vec<&str> = edges
        .iter()
        .filter(|e| e.to == node_id && e.kind == "control" && e.required)
        .map(|e| e.from.as_str())
        .collect();

    if required_preds.is_empty() {
        return Ok(());
    }

    let expected = required_preds.len();
    let mut observed = 0usize;
    for p in &required_preds {
        let st = states.get(*p).copied().unwrap_or(NodeTerminal::Running);
        match st {
            NodeTerminal::Running => {
                return Err(format!("join incomplete: predecessor {p} still running"));
            }
            NodeTerminal::Failed | NodeTerminal::Cancelled | NodeTerminal::TimedOut => {
                return Err(format!("join fail-closed: predecessor {p} ended {:?}", st));
            }
            NodeTerminal::Succeeded | NodeTerminal::Skipped => {
                observed += 1;
            }
        }
    }
    if observed != expected {
        return Err(format!(
            "join incomplete: expected {expected} got {observed}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: &str, kind: &str) -> GraphNode {
        GraphNode {
            id: id.into(),
            kind: kind.into(),
            label: id.into(),
            agent_id: None,
            fresh_context: None,
            writes: kind == "maker",
            isolation: "none".into(),
            node_timeout_ms: None,
            workspace_guid: None,
        }
    }

    fn edge(id: &str, from: &str, to: &str) -> GraphEdge {
        GraphEdge {
            id: id.into(),
            from: from.into(),
            to: to.into(),
            kind: "control".into(),
            required: true,
            max_cycles: None,
        }
    }

    #[test]
    fn sequence_compiles() {
        let g = CompiledGraph {
            nodes: vec![node("a", "maker"), node("b", "verify")],
            edges: vec![edge("e1", "a", "b")],
            entry: vec!["a".into()],
        };
        assert!(compile_graph(&g).is_ok());
    }

    #[test]
    fn empty_fails() {
        assert!(compile_graph(&CompiledGraph::default()).is_err());
    }

    #[test]
    fn multi_writer_without_isolation_fails() {
        let mut a = node("a", "maker");
        a.writes = true;
        let mut b = node("b", "maker");
        b.writes = true;
        let g = CompiledGraph {
            nodes: vec![a, b, node("j", "join")],
            edges: vec![edge("e1", "a", "j"), edge("e2", "b", "j")],
            entry: vec!["a".into(), "b".into()],
        };
        let err = compile_graph(&g).unwrap_err();
        assert!(err.0.contains("isolation"));
    }

    #[test]
    fn join_fail_closed_on_failed_pred() {
        let edges = vec![edge("e1", "a", "j"), edge("e2", "b", "j")];
        let mut states = HashMap::new();
        states.insert("a".into(), NodeTerminal::Succeeded);
        states.insert("b".into(), NodeTerminal::Failed);
        assert!(join_ready("j", &edges, &states).is_err());
    }

    #[test]
    fn join_incomplete_when_running() {
        let edges = vec![edge("e1", "a", "j")];
        let mut states = HashMap::new();
        states.insert("a".into(), NodeTerminal::Running);
        assert!(join_ready("j", &edges, &states).is_err());
    }

    #[test]
    fn join_ok_when_all_succeeded() {
        let edges = vec![edge("e1", "a", "j"), edge("e2", "b", "j")];
        let mut states = HashMap::new();
        states.insert("a".into(), NodeTerminal::Succeeded);
        states.insert("b".into(), NodeTerminal::Succeeded);
        assert!(join_ready("j", &edges, &states).is_ok());
    }
}
