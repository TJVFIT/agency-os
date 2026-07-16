/**
 * Assistant chat surface (Ethereal Glass).
 *
 * `AssistantRoot` is the drop-in: launcher orb + chat sheet + all data
 * wiring (lazy history fetch, optimistic sends through the queued-AI server
 * action, realtime replies, 90s timeout fallback). The parts underneath are
 * presentational and exported for reuse/tests.
 */

export { AssistantRoot } from './assistant-root';
export { AssistantPanel } from './assistant-panel';
export { AssistantLauncher } from './assistant-launcher';
export { AssistantComposer } from './composer';
export { AssistantMessageList } from './message-list';
export {
  AssistantMessageBubble,
  type AssistantChatMessage,
} from './message-bubble';
export {
  AssistantEmptyState,
  AssistantErrorBubble,
  AssistantOrb,
  AssistantThinking,
  MessageSkeleton,
  ThinkingDots,
} from './assistant-bits';
