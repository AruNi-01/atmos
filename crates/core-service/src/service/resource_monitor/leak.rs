//! Detect processes that outlived their launching terminal session.
//!
//! One rule: a cwd-attributed "other" process is leaked only when we can prove
//! it was reparented to init (PPID 0/1/None), or an ancestor in that other
//! bucket was. A parent PID that is simply missing from this sample is not
//! treated as dead.

use std::collections::HashMap;

pub(crate) fn parent_is_init(parent_pid: Option<u32>) -> bool {
    matches!(parent_pid, None | Some(0) | Some(1))
}

/// `cwd_other[i]` is true when process i is Project/Workspace `other_processes`.
pub(crate) fn mark_leaked_other_processes(
    parent_pid: &[Option<u32>],
    cwd_other: &[bool],
    by_pid: &HashMap<u32, Vec<usize>>,
) -> Vec<bool> {
    let n = parent_pid.len();
    let mut leaked = vec![false; n];
    let mut memo = vec![None; n];
    let mut visiting = vec![false; n];
    for (index, slot) in leaked.iter_mut().enumerate() {
        *slot = cwd_other_is_leaked(
            index,
            parent_pid,
            cwd_other,
            by_pid,
            &mut memo,
            &mut visiting,
        );
    }
    leaked
}

fn cwd_other_is_leaked(
    index: usize,
    parent_pid: &[Option<u32>],
    cwd_other: &[bool],
    by_pid: &HashMap<u32, Vec<usize>>,
    memo: &mut [Option<bool>],
    visiting: &mut [bool],
) -> bool {
    if !cwd_other[index] {
        return false;
    }
    if let Some(known) = memo[index] {
        return known;
    }
    if visiting[index] {
        return false;
    }
    visiting[index] = true;
    let leaked = if parent_is_init(parent_pid[index]) {
        true
    } else if let Some(ppid) = parent_pid[index] {
        by_pid
            .get(&ppid)
            .into_iter()
            .flatten()
            .copied()
            .any(|parent| {
                cwd_other_is_leaked(parent, parent_pid, cwd_other, by_pid, memo, visiting)
            })
    } else {
        false
    };
    visiting[index] = false;
    memo[index] = Some(leaked);
    leaked
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_init_counts_as_a_dead_parent() {
        assert!(parent_is_init(None));
        assert!(parent_is_init(Some(0)));
        assert!(parent_is_init(Some(1)));
        assert!(!parent_is_init(Some(10)));
        assert!(!parent_is_init(Some(99)));
    }

    #[test]
    fn orphan_roots_and_their_other_children_are_leaked() {
        let parent_pid = vec![Some(1), Some(10), Some(11), Some(5), Some(20)];
        let cwd_other = vec![true, true, true, false, true];
        let mut by_pid = HashMap::new();
        by_pid.insert(10, vec![0]);
        by_pid.insert(11, vec![1]);
        by_pid.insert(20, vec![3]);
        let leaked = mark_leaked_other_processes(&parent_pid, &cwd_other, &by_pid);
        assert_eq!(leaked, vec![true, true, true, false, false]);
    }

    #[test]
    fn missing_parent_from_sample_is_not_leaked() {
        let parent_pid = vec![Some(99)];
        let cwd_other = vec![true];
        let by_pid = HashMap::new();
        let leaked = mark_leaked_other_processes(&parent_pid, &cwd_other, &by_pid);
        assert_eq!(leaked, vec![false]);
    }
}
