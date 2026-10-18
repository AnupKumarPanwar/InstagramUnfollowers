import React from "react";
import { getFollowLogForDisplay } from "../utils/utils";
import { State } from "../model/state";
import { Language, t } from "../utils/i18n";

interface FollowingProps {
  state: State;
  scanningPaused: boolean;
  pauseScan: () => void;
  handleLogFilter: (e: React.ChangeEvent<HTMLInputElement>) => void;
  lang: Language;
}

export const Following = ({
  state,
  scanningPaused,
  pauseScan,
  handleLogFilter,
  lang,
}: FollowingProps) => {
  if (state.status !== "following") {
    return null;
  }

  const log = getFollowLogForDisplay(state.followLog, state.searchTerm, state.filter);

  return (
    <section className="workspace-layout">
      <aside className="app-sidebar">
        <div className="panel-heading">
          <span>{t(lang, "followQueue")}</span>
          <strong>{state.percentage}%</strong>
        </div>
        <p className="follow-target">{/^\d+$/.test(state.targetUsername) ? state.targetUsername : `@${state.targetUsername}`}</p>
        <p className="launch-note">{t(lang, "followAccountOf", state.targetIndex + 1, state.targets.length)}</p>
        {state.missedTargets.length > 0 && (
          <div className="missed-targets">
            <strong>{t(lang, "followMissedCount", state.missedTargets.length)}</strong>
            {state.missedTargets.map(target => (
              <span key={target}>{/^\d+$/.test(target) ? target : `@${target}`}</span>
            ))}
          </div>
        )}
        <div className="metric-stack">
          <p>
            <span>{t(lang, "followed")}</span>
            <strong>{state.followedCount}</strong>
          </p>
          <p>
            <span>{t(lang, "skipped")}</span>
            <strong>{state.skippedCount}</strong>
          </p>
          <p>
            <span>{t(lang, "failed")}</span>
            <strong>{state.failedCount}</strong>
          </p>
        </div>
        <p className="launch-note">{t(lang, "skippedNote")}</p>
        {state.outcome === "running" && (
          <button className="button-control button-pause" type="button" onClick={pauseScan}>
            {scanningPaused ? t(lang, "resume") : t(lang, "pause")}
          </button>
        )}
        <menu className="flex column grow m-clear p-clear">
          <p>{t(lang, "filters")}</p>
          <label className="badge m-small">
            <input
              type="checkbox"
              name="showSucceeded"
              checked={state.filter.showSucceeded}
              onChange={handleLogFilter}
            />
            &nbsp;{t(lang, "succeeded")}
          </label>
          <label className="badge m-small">
            <input
              type="checkbox"
              name="showFailed"
              checked={state.filter.showFailed}
              onChange={handleLogFilter}
            />
            &nbsp;{t(lang, "failed")}
          </label>
        </menu>
      </aside>
      <article className="unfollow-log-container">
        {state.outcome === "completed" && (
          <div className="status-banner is-ok">{t(lang, "allDone")}</div>
        )}
        {state.outcome === "blocked" && (
          <div className="status-banner is-bad">{t(lang, "followActionBlockedWarning")}</div>
        )}
        {state.outcome === "incomplete" && (
          <div className="status-banner">
            {t(lang, "followInterrupted", state.targetUsername, state.followedCount, state.skippedCount, state.failedCount)}
          </div>
        )}
        {state.outcome === "failed" && (
          <div className="status-banner is-bad">
            {state.error === "missing"
              ? t(lang, "followTargetMissing", state.targetUsername)
              : state.error === "lookup"
                ? t(lang, "followLookupFailed", state.targetUsername)
                : t(lang, "followListFailed", state.targetUsername)}
          </div>
        )}
        <div className="log-list">
          {log.map((entry, index) => (
            <div className={`log-entry ${entry.followedSuccessfully ? "is-ok" : "is-bad"}`} key={`${entry.user.id}-${index}`}>
              <span className="log-index">{index + 1}</span>
              <div className="log-copy">
                <a target="_blank" href={`/${entry.user.username}`} rel="noreferrer">
                  {entry.user.username}
                </a>
                <span>{entry.followedSuccessfully ? t(lang, "followed") : t(lang, "failedToFollow")}</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
};
