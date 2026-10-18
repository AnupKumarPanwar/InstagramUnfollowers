import React from "react";
import { getUnfollowLogForDisplay } from "../utils/utils";
import { State } from "../model/state";
import { Language, t } from "../utils/i18n";

interface UnfollowingProps {
  state: State;
  handleUnfollowFilter: (e: React.ChangeEvent<HTMLInputElement>) => void;
  lang: Language;
}

export const Unfollowing = (
  {
    state,
    handleUnfollowFilter,
    lang,
  }: UnfollowingProps) => {

  if (state.status !== "unfollowing") {
    return null;
  }

  return (
    <section className="workspace-layout">
      <aside className="app-sidebar">
        <div className="panel-heading">
          <span>{t(lang, "unfollowQueue")}</span>
          <strong>{state.percentage}%</strong>
        </div>
        <menu className="flex column grow m-clear p-clear">
          <p>{t(lang, "filters")}</p>
          <label className="badge m-small">
            <input
              type="checkbox"
              name="showSucceeded"
              checked={state.filter.showSucceeded}
              onChange={handleUnfollowFilter}
            />
            &nbsp;{t(lang, "succeeded")}
          </label>
          <label className="badge m-small">
            <input
              type="checkbox"
              name="showFailed"
              checked={state.filter.showFailed}
              onChange={handleUnfollowFilter}
            />
            &nbsp;{t(lang, "failed")}
          </label>
        </menu>
      </aside>
      <article className="unfollow-log-container">
        {state.unfollowLog.length === state.selectedResults.length && state.selectedResults.length > 0 && (
          <div className="status-banner is-ok">{t(lang, "allDone")}</div>
        )}
        <div className="log-list">
          {getUnfollowLogForDisplay(state.unfollowLog, state.searchTerm, state.filter).map(
            (entry, index) => (
              <div className={`log-entry ${entry.unfollowedSuccessfully ? "is-ok" : "is-bad"}`} key={entry.user.id}>
                <span className="log-index">{index + 1}</span>
                <div className="log-copy">
                  <a target="_blank" href={`/${entry.user.username}`} rel="noreferrer">
                    {entry.user.username}
                  </a>
                  <span>{entry.unfollowedSuccessfully ? t(lang, "unfollowed") : t(lang, "failedToUnfollow")}</span>
                </div>
              </div>
            ),
          )}
        </div>
      </article>
    </section>
  );
};
