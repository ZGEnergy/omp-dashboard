/**
 * Per-message "fork from here" control, shared verbatim by `ChatView`'s
 * message footer and `SkillInvocationCard`'s. Both rendered the identical
 * markup before; extracted so the pending state (spinner + disabled) is
 * implemented once.
 *
 * While a fork for this `entryId` is in flight the icon swaps to a spinner
 * and the button disables — the CopyButton idiom, except it settles on the
 * server response rather than a fixed timeout. Before this, clicking gave no
 * feedback at all and a double-tap spawned two pi sessions (issue #107 b/c).
 *
 * See change: fork-action-opens-an-empty-chat.
 */
import { mdiLoading, mdiSourceFork } from "@mdi/js";
import { Icon } from "@mdi/react";
import { useForkPending } from "../lib/ForkPendingContext.js";
import { t as i18nT } from "../lib/i18n";

export function ForkFromHereButton({
  entryId,
  onFork,
}: {
  entryId: string;
  onFork: (entryId: string) => void;
}) {
  const isForkPending = useForkPending();
  const pending = isForkPending(entryId);
  return (
    <button
      onClick={() => onFork(entryId)}
      disabled={pending}
      title={pending
        ? i18nT("session.forking", undefined, "Forking…")
        : i18nT("session.forkFromHere", undefined, "Fork from here")}
      className="p-0.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] disabled:cursor-default disabled:opacity-60"
      data-testid="fork-from-here-btn"
    >
      <Icon path={pending ? mdiLoading : mdiSourceFork} size={0.6} className={pending ? "animate-spin" : undefined} />
    </button>
  );
}
