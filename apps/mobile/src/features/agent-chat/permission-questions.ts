/** Web `ApprovalCard` waits this long before showing the next question. */
export const PERMISSION_QUESTION_ADVANCE_MS = 320;

/** Web `onReject` for an ask-user card sends this id, not a wire option. */
export const PERMISSION_QUESTION_REJECT_ID = "reject_once";

export function permissionQuestionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export function permissionQuestionsCanContinue(
  questions: readonly { id: string }[],
  answers: Readonly<Record<string, string>>,
): boolean {
  return (
    questions.length > 0 && questions.every((question) => Boolean(answers[question.id]?.trim()))
  );
}

export function permissionQuestionAnswersOptionId(
  answers: Readonly<Record<string, string>>,
): string {
  return `answers:${JSON.stringify(answers)}`;
}
