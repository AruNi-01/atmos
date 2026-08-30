"use client";

import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const TREE_BRANCH_EASE = [0.22, 1, 0.36, 1] as const;
const TREE_BRANCH_DURATION = 0.24;

export function FileTreeBranch({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : TREE_BRANCH_DURATION;

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          role="group"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { duration, ease: TREE_BRANCH_EASE },
            opacity: { duration: reduceMotion ? 0 : duration * 0.75, ease: TREE_BRANCH_EASE },
          }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
