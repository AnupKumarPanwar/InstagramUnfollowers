import React, { FormEvent, ReactNode, useState } from 'react';
import { REEL_COLLAB_LINK } from '../constants/constants';
import { Language, t } from '../utils/i18n';
import { UserNode } from '../model/user';

interface NotSearchingProps {
  onScan?: () => void;
  onFollow?: (username: string) => void;
  onReels?: () => void;
  lang: Language;
  cachedScan?: { readonly results: readonly UserNode[]; readonly timestamp: number } | null;
  onLoadCached?: () => void;
}

interface ToolCard {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly action: ReactNode;
}

export const NotSearching = ({ onScan, onFollow, onReels, lang, cachedScan, onLoadCached }: NotSearchingProps) => {
  const [username, setUsername] = useState("");

  const submitFollow = (event: FormEvent) => {
    event.preventDefault();
    onFollow?.(username);
  };

  const tools: readonly ToolCard[] = [
    {
      id: "audit",
      title: t(lang, "modeAudit"),
      description: t(lang, "launchDescription"),
      action: (
        <>
          <button className="run-scan" type="button" onClick={onScan}>
            {t(lang, "runScan")}
          </button>
          {cachedScan && cachedScan.results.length > 0 && onLoadCached && (
            <button type="button" className="load-cached-scan" onClick={onLoadCached}>
              {t(lang, "loadCachedScan", cachedScan.results.length)}
            </button>
          )}
        </>
      ),
    },
    {
      id: "follow",
      title: t(lang, "modeFollow"),
      description: t(lang, "followLaunchDescription"),
      action: (
        <form className="target-username" onSubmit={submitFollow}>
          <textarea
            name="targets"
            rows={5}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={t(lang, "targetUsernamePlaceholder")}
            value={username}
            onChange={event => setUsername(event.currentTarget.value)}
          />
          <button className="run-scan" type="submit">
            {t(lang, "startFollowing")}
          </button>
        </form>
      ),
    },
    {
      id: "reels",
      title: t(lang, "modeReels"),
      description: t(lang, "reelsLaunchDescription"),
      action: (
        <>
          <a className="reel-link" href={REEL_COLLAB_LINK} target="_blank" rel="noreferrer">
            {REEL_COLLAB_LINK}
          </a>
          <button className="run-scan" type="button" onClick={onReels}>
            {t(lang, "startReels")}
          </button>
        </>
      ),
    },
  ];

  return (
    <section className="launch-screen tool-catalog">
      <header className="catalog-head">
        <span className="eyebrow">{t(lang, "localAccountAudit")}</span>
        <h1>{t(lang, "launchTitle")}</h1>
        <p>{t(lang, "catalogDescription")}</p>
      </header>
      <div className="tool-grid">
        {tools.map(tool => (
          <article className="tool-card" key={tool.id}>
            <h2>{tool.title}</h2>
            <p>{tool.description}</p>
            <div className="tool-card-actions">{tool.action}</div>
          </article>
        ))}
      </div>
    </section>
  );
};
