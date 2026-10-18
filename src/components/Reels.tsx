import React, { ChangeEvent } from "react";
import { REEL_COLLAB_LINK } from "../constants/constants";
import { ReelLogEntry } from "../model/reel-log-entry";
import { State } from "../model/state";
import { Language, t } from "../utils/i18n";
import { assertUnreachable } from "../utils/utils";

interface ReelsProps {
  state: State;
  scanningPaused: boolean;
  pauseScan: () => void;
  handleFilter: (event: ChangeEvent<HTMLInputElement>) => void;
  lang: Language;
}

function formatCount(lang: Language, count: number): string {
  const separator = lang === "es" ? "." : ",";
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function entryDetail(entry: ReelLogEntry, lang: Language): string {
  const followers = entry.followerCount === null ? "" : formatCount(lang, entry.followerCount);
  switch (entry.reason) {
    case "sent":
      return entry.followerCount === null
        ? t(lang, "reelReasonSent")
        : `${t(lang, "reelReasonSent")} · ${t(lang, "reelReasonFollowers", followers)}`;
    case "followers":
      return t(lang, "reelReasonFollowers", followers);
    case "bio":
      return entry.followerCount === null
        ? t(lang, "reelReasonBio")
        : `${t(lang, "reelReasonBio")} · ${t(lang, "reelReasonFollowers", followers)}`;
    case "unknown_followers":
      return t(lang, "reelReasonUnknownFollowers");
    case "already":
      return t(lang, "reelReasonAlready");
    case "lookup":
      return t(lang, "reelReasonLookup");
    case "dm":
      return entry.followerCount === null
        ? t(lang, "reelReasonDm")
        : `${t(lang, "reelReasonDm")} · ${t(lang, "reelReasonFollowers", followers)}`;
    default:
      return assertUnreachable(entry.reason);
  }
}

export const Reels = ({ state, scanningPaused, pauseScan, handleFilter, lang }: ReelsProps) => {
  if (state.status !== "reels") {
    return null;
  }

  const log = state.log.filter(entry => {
    if (entry.kind === "sent" && !state.showSent) {
      return false;
    }
    if (entry.kind === "skipped" && !state.showSkipped) {
      return false;
    }
    if (entry.kind === "failed" && !state.showFailed) {
      return false;
    }
    const term = state.searchTerm.toLowerCase();
    if (term !== "" && !entry.user.username.toLowerCase().includes(term) && !entry.user.full_name.toLowerCase().includes(term)) {
      return false;
    }
    return true;
  });

  return (
    <section className="workspace-layout">
      <aside className="app-sidebar">
        <div className="panel-heading">
          <span>{t(lang, "reelsQueue")}</span>
          <strong>{state.percentage}%</strong>
        </div>
        {state.outcome === "running" && (
          <p className="follow-target">{state.currentUsername ? `@${state.currentUsername}` : t(lang, "reelsOpening")}</p>
        )}
        <a className="reel-link" href={REEL_COLLAB_LINK} target="_blank" rel="noreferrer">
          {REEL_COLLAB_LINK}
        </a>
        <div className="metric-stack">
          <p>
            <span>{t(lang, "reelsChecked")}</span>
            <strong>{state.checkedCount}</strong>
          </p>
          <p>
            <span>{t(lang, "reelsSent")}</span>
            <strong>{state.sentCount}</strong>
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
        <p className="launch-note">{t(lang, "reelsCriteria")}</p>
        {state.outcome === "running" && (
          <button className="button-control button-pause" type="button" onClick={pauseScan}>
            {scanningPaused ? t(lang, "resume") : t(lang, "pause")}
          </button>
        )}
        <menu className="flex column grow m-clear p-clear">
          <p>{t(lang, "filters")}</p>
          <label className="badge m-small">
            <input type="checkbox" name="showSent" checked={state.showSent} onChange={handleFilter} />
            &nbsp;{t(lang, "reelsSent")}
          </label>
          <label className="badge m-small">
            <input type="checkbox" name="showSkipped" checked={state.showSkipped} onChange={handleFilter} />
            &nbsp;{t(lang, "skipped")}
          </label>
          <label className="badge m-small">
            <input type="checkbox" name="showFailed" checked={state.showFailed} onChange={handleFilter} />
            &nbsp;{t(lang, "failed")}
          </label>
        </menu>
      </aside>
      <article className="unfollow-log-container">
        {state.banner === "done" && <div className="status-banner is-ok">{t(lang, "reelsDoneBanner")}</div>}
        {state.banner === "limit" && <div className="status-banner">{t(lang, "reelsCappedBanner")}</div>}
        {state.banner === "interrupted" && <div className="status-banner">{t(lang, "reelsFeedStoppedBanner")}</div>}
        {state.banner === "blocked" && <div className="status-banner is-bad">{t(lang, "reelsBlocked")}</div>}
        {state.banner === "failed" && <div className="status-banner is-bad">{t(lang, "reelsFailed")}</div>}
        {log.length === 0 ? (
          <p className="launch-note">{t(lang, "reelsLogEmpty")}</p>
        ) : (
          <div className="log-list">
            {log.map((entry, index) => (
              <div className={`log-entry ${entry.kind === "sent" ? "is-ok" : ""} ${entry.kind === "failed" ? "is-bad" : ""}`} key={`${entry.user.id}-${index}`}>
                <span className="log-index">{index + 1}</span>
                <div className="log-copy">
                  <a target="_blank" href={`https://www.instagram.com/${entry.user.username}/`} rel="noreferrer">
                    {entry.user.username}
                  </a>
                  <span>{entryDetail(entry, lang)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
};
