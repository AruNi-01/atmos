export function canResumeAgentChatSession(input: {
  chatId: string;
  client: object | null;
  loadedChatId: string | null;
  loadedClient: object | null;
}): boolean {
  return (
    input.client != null &&
    input.client === input.loadedClient &&
    input.loadedChatId === input.chatId
  );
}
