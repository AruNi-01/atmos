/** Guard the no-fence abort timer so a finished/rejected run cannot clobber later edits. */
export function shouldFireMdLiveFenceTimeout(args: {
  runId: number;
  activeRunId: number;
  locked: boolean;
}): boolean {
  return args.locked && args.runId === args.activeRunId;
}
