import React, { ChangeEvent, useEffect, useState } from "react";
import { render } from "react-dom";
import "./styles.scss";

import { Typename, UserNode } from "./model/user";
import { Toast } from "./components/Toast";
import { UserCheckIcon } from "./components/icons/UserCheckIcon";
import { UserUncheckIcon } from "./components/icons/UserUncheckIcon";
import {
  DEFAULT_TIME_BETWEEN_SEARCH_CYCLES,
  DEFAULT_TIME_BETWEEN_UNFOLLOWS,
  DEFAULT_TIME_TO_WAIT_AFTER_FIVE_SEARCH_CYCLES,
  DEFAULT_TIME_TO_WAIT_AFTER_FIVE_UNFOLLOWS,
  DEFAULT_USERS_PER_SEARCH_CYCLE,
  FOLLOWERS_PAGE_SAFETY_LIMIT,
  FOLLOW_LIST_PAGE_COUNT,
  FOLLOWING_PAGE_SAFETY_LIMIT,
  CHECKS_BEFORE_LONG_SLEEP,
  INSTAGRAM_ASBD_ID,
  INSTAGRAM_HOSTNAME,
  INSTAGRAM_WEB_APP_ID,
  RATE_LIMIT_COOLDOWN_SECONDS,
} from "./constants/constants";
import {
  addFollowerToIndex,
  assertUnreachable,
  createFollowerIndex,
  extractUserIdentities,
  fetchFriendshipsPage,
  followUser,
  FriendshipsListKind,
  FriendshipsPage,
  getCookie,
  getCurrentPageUnfollowers,
  getUsersForDisplay,
  InstagramApiError,
  InstagramProfile,
  isActionBlockedResponse,
  isUserInFollowerIndex,
  parseFollowTargets,
  profileForFollowToken,
  RawFriendshipUser,
  rawFriendshipUserToUserNode,
  sleep,
  unfollowUserUrlGenerator,
} from "./utils/utils";
import { NotSearching } from "./components/NotSearching";
import { State } from "./model/state";
import { Searching } from "./components/Searching";
import { Toolbar } from "./components/Toolbar";
import { Unfollowing } from "./components/Unfollowing";
import { Following } from "./components/Following";
import { Reels } from "./components/Reels";
import { Timings } from "./model/timings";
import { loadCachedScanResults, loadTimings, loadWhitelist, saveCachedScanResults, saveTimings, saveWhitelist } from "./utils/whitelist-manager";
import { getInitialLanguage, Language, saveLanguage, t } from "./utils/i18n";
import { runReelCollabs } from "./utils/reels-outreach";

const LOCAL_PREVIEW_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const isLocalPreview = LOCAL_PREVIEW_HOSTS.has(location.hostname);

const _avatarUrl = (seed: string): string =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0f172a,1f2937,312e81&fontFamily=Verdana`;

const _createPreviewUser = (
  id: string,
  username: string,
  fullName: string,
  options: { readonly isPrivate?: boolean; readonly isVerified?: boolean; readonly followsViewer?: boolean } = {},
): UserNode => ({
  id,
  username,
  full_name: fullName,
  profile_pic_url: _avatarUrl(username),
  is_private: options.isPrivate ?? false,
  is_verified: options.isVerified ?? false,
  followed_by_viewer: true,
  follows_viewer: options.followsViewer ?? false,
  requested_by_viewer: false,
  reel: {
    id,
    expiring_at: 0,
    has_pride_media: false,
    latest_reel_media: 0,
    seen: null,
    owner: {
      __typename: Typename.GraphUser,
      id,
      profile_pic_url: _avatarUrl(username),
      username,
    },
  },
});

const _getPreviewUsers = (): readonly UserNode[] => [
  _createPreviewUser("1", "alina.frames", "Alina Moreno", { isVerified: true }),
  _createPreviewUser("2", "brassandbone", "Theo Walsh", { isPrivate: true }),
  _createPreviewUser("3", "citrus.archive", "Mara Kim", { followsViewer: true }),
  _createPreviewUser("4", "dawnledger", "Jon Bell", { isPrivate: true }),
  _createPreviewUser("5", "elias.market", "Elias Noor", { isVerified: true }),
  _createPreviewUser("6", "fieldnotes.studio", "Nadia Reyes"),
  _createPreviewUser("7", "glint.supply", "Remy Park", { followsViewer: true }),
  _createPreviewUser("8", "harbor.sequence", "Ivy Chen", { isPrivate: true }),
  _createPreviewUser("9", "inkline.daily", "Sofia Grant"),
  _createPreviewUser("10", "juniper.signal", "Cal Reed", { isVerified: true }),
  _createPreviewUser("11", "keystone.labs", "Mina Torres"),
  _createPreviewUser("12", "lowlight.club", "Owen Voss", { isPrivate: true }),
];



function App() {
  const [state, setState] = useState<State>({
    ...(
      isLocalPreview && new URLSearchParams(location.search).get("preview") === "scanning"
        ? {
          status: "scanning",
          page: 1,
          searchTerm: "",
          currentTab: "non_whitelisted",
          percentage: 100,
          results: _getPreviewUsers(),
          selectedResults: _getPreviewUsers().slice(0, 3),
          whitelistedResults: _getPreviewUsers().slice(10, 12),
          filter: {
            showVerified: true,
            showPrivate: true,
            showWithOutProfilePicture: true,
          },
        } as State
        : { status: "initial" as const }
    ),
  });

  const [toast, setToast] = useState<{ readonly show: false } | { readonly show: true; readonly text: string }>({
    show: false,
  });

  const [timings, setTimings] = useState<Timings>(() => {
    const storedTimings = loadTimings();
    return {
      timeBetweenSearchCycles: storedTimings?.timeBetweenSearchCycles ?? DEFAULT_TIME_BETWEEN_SEARCH_CYCLES,
      timeToWaitAfterFiveSearchCycles: storedTimings?.timeToWaitAfterFiveSearchCycles ?? DEFAULT_TIME_TO_WAIT_AFTER_FIVE_SEARCH_CYCLES,
      timeBetweenUnfollows: storedTimings?.timeBetweenUnfollows ?? DEFAULT_TIME_BETWEEN_UNFOLLOWS,
      timeToWaitAfterFiveUnfollows: storedTimings?.timeToWaitAfterFiveUnfollows ?? DEFAULT_TIME_TO_WAIT_AFTER_FIVE_UNFOLLOWS,
      usersPerSearchCycle: storedTimings?.usersPerSearchCycle ?? DEFAULT_USERS_PER_SEARCH_CYCLE,
    };
  });

  // Save timings whenever they change
  useEffect(() => {
    saveTimings(timings);
  }, [timings]);

  const [cachedScan, setCachedScan] = useState<{ readonly results: readonly UserNode[]; readonly timestamp: number } | null>(() =>
    loadCachedScanResults(),
  );

  const [lang, setLang] = useState<Language>(() => getInitialLanguage());

  const [scanningPaused, setScanningPaused] = useState(false);
  const scanningPausedRef = React.useRef(false);

  const pauseScan = () => {
    setScanningPaused(prev => {
      const next = !prev;
      scanningPausedRef.current = next;
      return next;
    });
  };

  const handleLanguageChange = (newLang: Language) => {
    setLang(newLang);
    saveLanguage(newLang);
  };


  let isActiveProcess: boolean;
  switch (state.status) {
    case "initial":
      isActiveProcess = false;
      break;
    case "scanning":
      isActiveProcess = Boolean(state.isScanningActive);
      break;
    case "unfollowing":
      isActiveProcess = state.percentage < 100;
      break;
    case "following":
      isActiveProcess = state.outcome === "running";
      break;
    case "reels":
      isActiveProcess = state.outcome === "running";
      break;
    default:
      assertUnreachable(state);
  }

  const onLoadCached = () => {
    if (!cachedScan || cachedScan.results.length === 0) {
      return;
    }
    const whitelistedResults = loadWhitelist();
    setState({
      status: "scanning",
      page: 1,
      searchTerm: "",
      currentTab: "non_whitelisted",
      percentage: 100,
      isScanningActive: false,
      results: cachedScan.results,
      selectedResults: [],
      whitelistedResults,
      filter: {
        showVerified: true,
        showPrivate: true,
        showWithOutProfilePicture: true,
      },
    });
    setToast({
      show: true,
      text: t(lang, "loadedFromCache", cachedScan.results.length),
    });
  };

  const onScan = async () => {
    if (state.status !== "initial") {
      return;
    }
    if (isLocalPreview) {
      const previewUsers = _getPreviewUsers();
      setState({
        status: "scanning",
        page: 1,
        searchTerm: "",
        currentTab: "non_whitelisted",
        percentage: 100,
        isScanningActive: false,
        results: previewUsers,
        selectedResults: previewUsers.slice(0, 3),
        whitelistedResults: previewUsers.slice(10, 12),
        filter: {
          showVerified: true,
          showPrivate: true,
          showWithOutProfilePicture: true,
        },
      });
      return;
    }
    const whitelistedResults = loadWhitelist();
    setState({
      status: "scanning",
      page: 1,
      searchTerm: "",
      currentTab: "non_whitelisted",
      percentage: 0,
      isScanningActive: true,
      results: [],
      selectedResults: [],
      whitelistedResults,
      filter: {
        showVerified: true,
        showPrivate: true,
        showWithOutProfilePicture: true,
      },
    });
  };

  const onFollow = (rawTargets: string) => {
    if (state.status !== "initial") {
      return;
    }
    const parsed = parseFollowTargets(rawTargets);
    if (parsed.targets.length === 0) {
      setToast({
        show: true,
        text: rawTargets.trim() ? t(lang, "invalidUsername") : t(lang, "usernameRequired"),
      });
      return;
    }
    if (!confirm(t(lang, "followConfirm", parsed.targets.length))) {
      return;
    }
    if (parsed.invalid.length > 0) {
      setToast({ show: true, text: t(lang, "someTargetsIgnored", parsed.invalid.length) });
    }
    scanningPausedRef.current = false;
    setScanningPaused(false);
    setState({
      status: "following",
      targets: parsed.targets,
      targetIndex: 0,
      targetUsername: parsed.targets[0],
      missedTargets: [],
      searchTerm: "",
      percentage: 0,
      followLog: [],
      filter: {
        showSucceeded: true,
        showFailed: true,
      },
      outcome: "running",
      error: null,
      followedCount: 0,
      failedCount: 0,
      skippedCount: 0,
    });
  };

  const onReels = () => {
    if (state.status !== "initial") {
      return;
    }
    if (!confirm(t(lang, "reelsConfirm"))) {
      return;
    }
    scanningPausedRef.current = false;
    setScanningPaused(false);
    setState({
      status: "reels",
      searchTerm: "",
      percentage: 0,
      outcome: "running",
      banner: null,
      log: [],
      showSent: true,
      showSkipped: false,
      showFailed: true,
      checkedCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      currentUsername: "",
    });
  };

  const handleScanFilter = (e: ChangeEvent<HTMLInputElement>) => {
    if (state.status !== "scanning") {
      return;
    }
    if (state.selectedResults.length > 0) {
      if (!confirm("Changing filter options will clear selected users")) {
        // Force re-render. Bit of a hack but had an issue where the checkbox state was still
        // changing in the UI even even when not confirming. So updating the state fixes this
        // by synchronizing the checkboxes with the filter statuses in the state.
        setState({ ...state });
        return;
      }
    }
    setState({
      ...state,
      // Make sure to clear selected results when changing filter options. This is to avoid having
      // users selected in the unfollow queue but not visible in the UI, which would be confusing.
      selectedResults: [],
      filter: {
        ...state.filter,
        [e.currentTarget.name]: e.currentTarget.checked,
      },
    });
  };

  const handleReelsFilter = (e: ChangeEvent<HTMLInputElement>) => {
    if (state.status !== "reels") {
      return;
    }
    const name = e.currentTarget.name;
    if (name !== "showSent" && name !== "showSkipped" && name !== "showFailed") {
      return;
    }
    setState({
      ...state,
      showSent: name === "showSent" ? e.currentTarget.checked : state.showSent,
      showSkipped: name === "showSkipped" ? e.currentTarget.checked : state.showSkipped,
      showFailed: name === "showFailed" ? e.currentTarget.checked : state.showFailed,
    });
  };

  const handleUnfollowFilter = (e: ChangeEvent<HTMLInputElement>) => {
    if (state.status !== "unfollowing" && state.status !== "following") {
      return;
    }
    setState({
      ...state,
      filter: {
        ...state.filter,
        [e.currentTarget.name]: e.currentTarget.checked,
      },
    });
  };

  const toggleUser = (newStatus: boolean, user: UserNode) => {
    if (state.status !== "scanning") {
      return;
    }
    if (newStatus) {
      setState({
        ...state,
        selectedResults: [...state.selectedResults, user],
      });
    } else {
      setState({
        ...state,
        selectedResults: state.selectedResults.filter(result => result.id !== user.id),
      });
    }
  };

  const toggleAllUsers = (e: ChangeEvent<HTMLInputElement>) => {
    if (state.status !== "scanning") {
      return;
    }
    const displayed = getUsersForDisplay(
      state.results,
      state.whitelistedResults,
      state.currentTab,
      state.searchTerm,
      state.filter,
    );
    if (e.currentTarget.checked) {
      const currentIds = new Set(state.selectedResults.map(u => u.id));
      const toAdd = displayed.filter(u => !currentIds.has(u.id));
      setState({
        ...state,
        selectedResults: [...state.selectedResults, ...toAdd],
      });
    } else {
      const displayedIds = new Set(displayed.map(u => u.id));
      setState({
        ...state,
        selectedResults: state.selectedResults.filter(u => !displayedIds.has(u.id)),
      });
    }
  };

  // it will work the same as toggleAllUsers, but it will select everyone on the current page.
  const toggleCurrentePageUsers = (e: ChangeEvent<HTMLInputElement>) => {
    if (state.status !== "scanning") {
      return;
    }
    const pageUsers = getCurrentPageUnfollowers(
      getUsersForDisplay(
        state.results,
        state.whitelistedResults,
        state.currentTab,
        state.searchTerm,
        state.filter,
      ),
      state.page,
    );
    if (e.currentTarget.checked) {
      const currentIds = new Set(state.selectedResults.map(u => u.id));
      const toAdd = pageUsers.filter(u => !currentIds.has(u.id));
      setState({
        ...state,
        selectedResults: [...state.selectedResults, ...toAdd],
      });
    } else {
      const pageUserIds = new Set(pageUsers.map(u => u.id));
      setState({
        ...state,
        selectedResults: state.selectedResults.filter(u => !pageUserIds.has(u.id)),
      });
    }
  };

  const onWhitelistUpdate = (updatedWhitelist: readonly UserNode[]) => {
    saveWhitelist(updatedWhitelist);
    if (state.status === "scanning") {
      setState({
        ...state,
        whitelistedResults: updatedWhitelist,
      });
    }
  };

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Prompt user if he tries to leave while in the middle of a process (searching / unfollowing / etc..)
      // This is especially good for avoiding accidental tab closing which would result in a frustrating experience.
      if (!isActiveProcess) {
        return;
      }

      // `e` Might be undefined in older browsers, so silence linter for this one.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      e = e || window.event;

      // `e` Might be undefined in older browsers, so silence linter for this one.
      // For IE and Firefox prior to version 4
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (e) {
        e.returnValue = "Changes you made may not be saved.";
      }

      // For Safari
      return "Changes you made may not be saved.";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isActiveProcess, state]);

  useEffect(() => {
    // Fetches one page, retrying with backoff on rate limits / network errors.
    // `blocked` is true when retries were exhausted for such a transient error
    // (the scan should stop); false means a different, non-retryable error
    // (e.g. 404 / unavailable account), which callers may choose to skip.
    type PageResult =
      | { readonly ok: true; readonly page: FriendshipsPage }
      | { readonly ok: false; readonly blocked: boolean };

    const fetchPageWithRetry = async (
      kind: FriendshipsListKind,
      maxId?: string,
      count?: number,
      userId?: string,
    ): Promise<PageResult> => {
      let retries = 0;
      const maxRetries = 3;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        try {
          return { ok: true, page: await fetchFriendshipsPage(kind, maxId, count, userId) };
        } catch (e: any) {
          const status = e?.status;
          const message = String(e?.message ?? "");
          const isRateLimitOrSoftBlock =
            (e instanceof InstagramApiError || e?.name === "InstagramApiError") &&
            (status === 429 || /feedback_required|checkpoint|rate limit|please wait/i.test(message));
          const isNetworkError = e instanceof TypeError || /fetch|network/i.test(message);
          const isTransient = isRateLimitOrSoftBlock || isNetworkError;

          if (isTransient && retries < maxRetries) {
            retries++;
            const waitSeconds = isRateLimitOrSoftBlock
              ? RATE_LIMIT_COOLDOWN_SECONDS * retries
              : 5 * retries;
            for (let sec = waitSeconds; sec > 0; sec--) {
              setToast({
                show: true,
                text: t(lang, "rateLimitPause", sec),
              });
              await sleep(1000);
            }
            setToast({ show: false });
            continue;
          }
          console.error(`${kind} request failed${userId ? ` for ${userId}` : ""}:`, e);
          return { ok: false, blocked: isTransient };
        }
      }
    };

    let requestsSinceLongSleep = 0;
    const paceRequest = async () => {
      // Pause scanning if user requested so.
      while (scanningPausedRef.current) {
        await sleep(1000);
        console.info("Scan paused");
      }

      await sleep(Math.floor(Math.random() * 700) + 300);
      await sleep(Math.floor(Math.random() * (timings.timeBetweenSearchCycles - timings.timeBetweenSearchCycles * 0.7)) + timings.timeBetweenSearchCycles);

      requestsSinceLongSleep++;
      if (requestsSinceLongSleep >= CHECKS_BEFORE_LONG_SLEEP) {
        requestsSinceLongSleep = 0;
        const longSleepVar = Math.max(
          0,
          timings.timeToWaitAfterFiveSearchCycles + (Math.random() * 10000 - 5000), // +/- 5 seconds
        );
        setToast({
          show: true,
          text: t(lang, "sleepingSafety", Math.round(longSleepVar / 1000)),
        });
        await sleep(longSleepVar);
      }
      setToast({ show: false });
    };

    // Walks the viewer's own list (followers or following) page by page. `onPageUsers` is
    // awaited for each page before the next one is requested and returns
    // false to stop the walk early. Resolves true only if the whole list was
    // walked.
    const fetchList = async (
      kind: FriendshipsListKind,
      pageSafetyLimit: number,
      onPageUsers: (pageUsers: readonly RawFriendshipUser[]) => Promise<boolean>,
    ): Promise<boolean> => {
      let maxId: string | undefined;
      let pagesFetched = 0;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const result = await fetchPageWithRetry(kind, maxId, timings.usersPerSearchCycle);
        if (!result.ok) {
          console.error(`Stopping ${kind} scan early.`);
          return false;
        }
        const page = result.page;
        const pageUsers = page.users ?? [];

        if (!(await onPageUsers(pageUsers))) {
          return false;
        }

        const hasMore = Boolean(page.next_max_id) && page.has_more !== false;
        if (!hasMore || pageUsers.length === 0) {
          return true;
        }

        pagesFetched += 1;
        if (pagesFetched >= pageSafetyLimit) {
          console.error(`Stopping ${kind} scan early: hit the safety cap of ${pageSafetyLimit} pages.`);
          return false;
        }
        maxId = page.next_max_id;

        await paceRequest();
      }
    };

    const scan = async () => {
      if (state.status !== "scanning" || isLocalPreview) {
        return;
      }
      if (state.percentage === 100) {
        return;
      }

      const viewerId = getCookie("ds_user_id");
      if (viewerId === null) {
        setState(prevState =>
          prevState.status === "scanning" ? { ...prevState, isScanningActive: false } : prevState,
        );
        setToast({ show: true, text: t(lang, "scanFailedFollowing") });
        return;
      }

      // Phase 1: Retrieve and index all of the viewer's followers.
      // We dual-index by ID and normalized lowercase username to guarantee zero false positives.
      const followerIndex = createFollowerIndex();
      let followersCount = 0;

      const indexFollowersPage = async (pageUsers: readonly RawFriendshipUser[]): Promise<boolean> => {
        for (const user of pageUsers) {
          addFollowerToIndex(followerIndex, user);
          followersCount++;
        }

        const followersProgress = Math.min(49, Math.round(50 * (1 - 1 / (1 + followersCount / 150))));
        setState(prevState =>
          prevState.status === "scanning"
            ? {
                ...prevState,
                percentage: followersProgress,
                totalScanned: followersCount,
              }
            : prevState,
        );

        setToast({
          show: true,
          text: t(lang, "indexingFollowersProgress", followersCount),
        });

        return true;
      };

      const followersCompleted = await fetchList(
        "followers",
        FOLLOWERS_PAGE_SAFETY_LIMIT,
        indexFollowersPage,
      );

      if (!followersCompleted) {
        // If followers list could not be fully loaded, aborting is mandatory.
        // Proceeding with an incomplete follower index would cause true followers
        // to be falsely flagged as unfollowers.
        setState(prevState =>
          prevState.status === "scanning"
            ? { ...prevState, isScanningActive: false, scanIncomplete: true }
            : prevState,
        );
        setToast({
          show: true,
          text: t(lang, "scanFailedFollowers"),
        });
        return;
      }

      // Mark Phase 1 complete at 50%
      setState(prevState =>
        prevState.status === "scanning"
          ? { ...prevState, percentage: 50 }
          : prevState,
      );

      // Phase 2: Walk the viewer's following list and check each against the follower index.
      // Accounts not in the index genuinely do not follow back and are progressively streamed to UI.
      const nonFollowers: UserNode[] = [];
      let checkedCount = 0;

      const checkFollowingPage = async (pageUsers: readonly RawFriendshipUser[]): Promise<boolean> => {
        const newNonFollowersBatch: UserNode[] = [];

        for (const user of pageUsers) {
          const followsViewer = isUserInFollowerIndex(followerIndex, user);
          if (!followsViewer) {
            const node = rawFriendshipUserToUserNode(user, false);
            nonFollowers.push(node);
            newNonFollowersBatch.push(node);
          }
          checkedCount++;
        }

        const followingProgress = Math.min(99, 50 + Math.round(50 * (1 - 1 / (1 + checkedCount / 150))));

        setState(prevState =>
          prevState.status === "scanning"
            ? {
                ...prevState,
                results: newNonFollowersBatch.length > 0 ? [...prevState.results, ...newNonFollowersBatch] : prevState.results,
                totalScanned: checkedCount,
                percentage: followingProgress,
              }
            : prevState,
        );

        setToast({
          show: true,
          text: t(lang, "scanningFollowingProgress", checkedCount),
        });

        return true;
      };

      const followingCompleted = await fetchList(
        "following",
        FOLLOWING_PAGE_SAFETY_LIMIT,
        checkFollowingPage,
      );

      if (!followingCompleted && checkedCount === 0) {
        setState(prevState =>
          prevState.status === "scanning" ? { ...prevState, isScanningActive: false } : prevState,
        );
        setToast({
          show: true,
          text: t(lang, "scanFailedFollowing"),
        });
        return;
      }

      const scanIsComplete = followingCompleted;

      if (scanIsComplete || nonFollowers.length > 0) {
        saveCachedScanResults(nonFollowers);
        setCachedScan({ results: nonFollowers, timestamp: Date.now() });
      }

      setState(prevState => {
        if (prevState.status !== "scanning") {
          return prevState;
        }
        return {
          ...prevState,
          percentage: 100,
          scanIncomplete: !scanIsComplete,
          isScanningActive: false,
          results: nonFollowers,
          totalScanned: checkedCount,
        };
      });

      setToast({
        show: true,
        text: scanIsComplete
          ? t(lang, "scanCompleted")
          : t(lang, "partialScanInterrupted", checkedCount),
      });
    };
    scan();
    // Dependency array not entirely legit, but works this way. TODO: Find a way to fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  useEffect(() => {
    const unfollow = async () => {
      if (state.status !== "unfollowing" || isLocalPreview) {
        return;
      }

      const csrftoken = getCookie("csrftoken");
      if (csrftoken === null) {
        throw new Error("csrftoken cookie is null");
      }

      let counter = 0;
      for (const user of state.selectedResults) {
        counter += 1;
        // Fix: Changed from Math.floor to Math.round to ensure progress reaches 100%
        // Math.floor would leave progress at 99% when near completion
        const percentage = Math.round((counter / state.selectedResults.length) * 100);
        try {
          const res = await fetch(unfollowUserUrlGenerator(user.id), {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              "x-csrftoken": csrftoken,
              "x-ig-app-id": INSTAGRAM_WEB_APP_ID,
              "x-asbd-id": INSTAGRAM_ASBD_ID,
              "x-requested-with": "XMLHttpRequest",
            },
            method: "POST",
            credentials: "same-origin",
          });
          const data = (await res.json().catch(() => null)) as any;
          const isActionBlocked = isActionBlockedResponse(res.status, data);

          const success = res.ok && data?.status !== "fail" && !isActionBlocked;
          if (!success) {
            console.warn(`Unfollow for ${user.username} failed (HTTP ${res.status}):`, data);
          }
          setState(prevState => {
            if (prevState.status !== "unfollowing") {
              return prevState;
            }
            return {
              ...prevState,
              percentage,
              unfollowLog: [
                ...prevState.unfollowLog,
                {
                  user,
                  unfollowedSuccessfully: success,
                },
              ],
            };
          });

          if (isActionBlocked) {
            setToast({
              show: true,
              text: t(lang, "actionBlockedWarning"),
            });
            break;
          }
        } catch (e) {
          console.error(e);
          setState(prevState => {
            if (prevState.status !== "unfollowing") {
              return prevState;
            }
            return {
              ...prevState,
              percentage,
              unfollowLog: [
                ...prevState.unfollowLog,
                {
                  user,
                  unfollowedSuccessfully: false,
                },
              ],
            };
          });
        }
        // If unfollowing the last user in the list, no reason to wait.
        if (user === state.selectedResults[state.selectedResults.length - 1]) {
          break;
        }
        await sleep(Math.floor(Math.random() * (timings.timeBetweenUnfollows * 1.2 - timings.timeBetweenUnfollows)) + timings.timeBetweenUnfollows);

        if (counter % 5 === 0) {
          setToast({
            show: true,
            text: t(lang, "sleepingSafety", `${Math.round(timings.timeToWaitAfterFiveUnfollows / 60000)}m`),
          });
          await sleep(timings.timeToWaitAfterFiveUnfollows);
        }
        setToast({ show: false });
      }
    };
    unfollow();
    // Dependency array not entirely legit, but works this way. TODO: Find a way to fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  useEffect(() => {
    let cancelled = false;

    const finish = (
      outcome: "completed" | "blocked" | "failed" | "incomplete",
      error: "missing" | "list" | "lookup" | null,
      counts: { readonly followed: number; readonly failed: number; readonly skipped: number },
      toastText: string,
      missedTargets?: readonly string[],
    ) => {
      setState(prevState => {
        if (prevState.status !== "following") {
          return prevState;
        }
        return {
          ...prevState,
          outcome,
          error,
          percentage: outcome === "completed" ? 100 : prevState.percentage,
          followedCount: counts.followed,
          failedCount: counts.failed,
          skippedCount: counts.skipped,
          missedTargets: missedTargets ?? prevState.missedTargets,
        };
      });
      setToast({ show: true, text: toastText });
    };

    const progressFor = (seen: number, followerCount: number | null): number => {
      if (followerCount && followerCount > 0) {
        return Math.min(99, Math.round((seen / followerCount) * 100));
      }
      return Math.min(99, Math.round(99 * (1 - 1 / (1 + seen / 150))));
    };

    const waitIfPaused = async () => {
      while (scanningPausedRef.current && !cancelled) {
        await sleep(1000);
      }
    };

    const sleepBetweenFollows = async (attemptCount: number) => {
      await sleep(
        Math.floor(Math.random() * (timings.timeBetweenUnfollows * 1.2 - timings.timeBetweenUnfollows)) +
          timings.timeBetweenUnfollows,
      );
      if (attemptCount % 5 === 0) {
        setToast({
          show: true,
          text: t(lang, "sleepingSafety", `${Math.round(timings.timeToWaitAfterFiveUnfollows / 60000)}m`),
        });
        await sleep(timings.timeToWaitAfterFiveUnfollows);
        if (!cancelled) {
          setToast({ show: false });
        }
      }
    };

    const paceNextPage = async () => {
      await waitIfPaused();
      if (cancelled) {
        return;
      }
      await sleep(Math.floor(Math.random() * 700) + 300);
      await sleep(
        Math.floor(Math.random() * (timings.timeBetweenSearchCycles - timings.timeBetweenSearchCycles * 0.7)) +
          timings.timeBetweenSearchCycles,
      );
    };

    const fetchFollowersPage = async (userId: string, maxId?: string) => {
      let retries = 0;
      const maxRetries = 3;
      while (!cancelled) {
        try {
          return {
            ok: true as const,
            page: await fetchFriendshipsPage("followers", maxId, FOLLOW_LIST_PAGE_COUNT, userId),
          };
        } catch (e: any) {
          const status = e?.status;
          const message = String(e?.message ?? "");
          const isRateLimitOrSoftBlock =
            (e instanceof InstagramApiError || e?.name === "InstagramApiError") &&
            (status === 429 || /feedback_required|checkpoint|rate limit|please wait/i.test(message));
          const isNetworkError = e instanceof TypeError || /fetch|network/i.test(message);
          const isTransient = isRateLimitOrSoftBlock || isNetworkError;
          if (isTransient && retries < maxRetries) {
            retries++;
            const waitSeconds = isRateLimitOrSoftBlock ? RATE_LIMIT_COOLDOWN_SECONDS * retries : 5 * retries;
            for (let sec = waitSeconds; sec > 0; sec--) {
              if (cancelled) {
                return { ok: false as const, blocked: false };
              }
              setToast({ show: true, text: t(lang, "rateLimitPause", sec) });
              await sleep(1000);
            }
            setToast({ show: false });
            continue;
          }
          console.error(`followers request failed for ${userId}:`, e);
          const hardBlock = /feedback_required|checkpoint|action_blocked/i.test(message);
          return { ok: false as const, blocked: hardBlock };
        }
      }
      return { ok: false as const, blocked: false };
    };

    const run = async () => {
      if (state.status !== "following") {
        return;
      }
      const targets = state.targets;
      const targetLabel = (value: string) => (/^\d+$/.test(value) ? value : `@${value}`);
      const overallPercentage = (targetIndex: number, inner: number) =>
        Math.min(99, Math.round(((targetIndex + inner / 100) / Math.max(targets.length, 1)) * 100));

      let followed = 0;
      let failed = 0;
      let skipped = 0;
      let followAttempts = 0;
      let consecutiveBlocks = 0;
      const missedTargets: string[] = [];
      const seenIds = new Set<string>();

      const remember = (targetIndex: number, label: string, inner: number) => {
        setState(prevState => {
          if (prevState.status !== "following") {
            return prevState;
          }
          return {
            ...prevState,
            targetIndex,
            targetUsername: label,
            percentage: overallPercentage(targetIndex, inner),
            followedCount: followed,
            failedCount: failed,
            skippedCount: skipped,
            missedTargets: [...missedTargets],
          };
        });
      };

      const skipTarget = (token: string, targetIndex: number) => {
        if (!missedTargets.includes(token)) {
          missedTargets.push(token);
        }
        remember(targetIndex, token, 100);
        setToast({ show: true, text: t(lang, "followTargetSkipped", targetLabel(token)) });
      };

      if (isLocalPreview) {
        const previewUsers = _getPreviewUsers().filter(user => !user.follows_viewer).slice(0, 2);
        for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
          if (cancelled) {
            return;
          }
          const token = targets[targetIndex];
          remember(targetIndex, token, 0);
          if (token.toLowerCase() === "missing") {
            skipTarget(token, targetIndex);
            continue;
          }
          for (let userIndex = 0; userIndex < previewUsers.length; userIndex += 1) {
            if (cancelled) {
              return;
            }
            await waitIfPaused();
            await sleep(120);
            if (cancelled) {
              return;
            }
            const user = previewUsers[userIndex];
            followed += 1;
            const inner = Math.round(((userIndex + 1) / previewUsers.length) * 100);
            setState(prevState => {
              if (prevState.status !== "following") {
                return prevState;
              }
              return {
                ...prevState,
                percentage: overallPercentage(targetIndex, inner),
                followedCount: followed,
                failedCount: failed,
                skippedCount: skipped,
                followLog: [...prevState.followLog, { user: { ...user, id: `${user.id}-${token}` }, followedSuccessfully: true }],
              };
            });
          }
        }
        if (!cancelled) {
          finish(
            "completed",
            null,
            { followed, failed, skipped },
            t(lang, "followCompleted", targets.length, followed, skipped, failed, missedTargets.length),
            missedTargets,
          );
        }
        return;
      }

      const originalHref = location.href;
      try {
      if (getCookie("csrftoken") === null || getCookie("ds_user_id") === null) {
        finish("failed", "list", { followed: 0, failed: 0, skipped: 0 }, t(lang, "followListFailed", targetLabel(targets[0] ?? "")));
        return;
      }

      const viewerId = getCookie("ds_user_id");

      for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
        if (cancelled) {
          return;
        }
        const token = targets[targetIndex];
        try {
        remember(targetIndex, token, 0);
        await waitIfPaused();
        if (cancelled) {
          return;
        }

        let profile: InstagramProfile;
        try {
          profile = await profileForFollowToken(token, {
            shouldAbort: () => cancelled,
            onCooldown: secondsRemaining => {
              if (secondsRemaining <= 0) {
                setToast({ show: false });
                return;
              }
              setToast({ show: true, text: t(lang, "rateLimitPause", secondsRemaining) });
            },
          });
        } catch (e) {
          console.error(e);
          if (cancelled || (e instanceof InstagramApiError && e.status === 0)) {
            return;
          }
          if (!cancelled) {
            skipTarget(token, targetIndex);
          }
          continue;
        }
        if (cancelled) {
          return;
        }
        remember(targetIndex, profile.username, 0);

        let maxId: string | undefined;
        let pagesRead = 0;

        while (!cancelled) {
          await waitIfPaused();
          if (cancelled) {
            return;
          }

          const pageResult = await fetchFollowersPage(profile.id, maxId);
          if (cancelled) {
            return;
          }
          if (!pageResult.ok) {
            if (pageResult.blocked) {
              consecutiveBlocks += 1;
              if (consecutiveBlocks >= 3) {
                finish("blocked", null, { followed, failed, skipped }, t(lang, "followActionBlockedWarning"), missedTargets);
                return;
              }
            }
            if (pagesRead === 0) {
              skipTarget(profile.username, targetIndex);
            } else {
              setToast({ show: true, text: t(lang, "followTargetSkipped", targetLabel(profile.username)) });
            }
            break;
          }

          const page = pageResult.page;
          const pageUsers = page.users ?? [];
          pagesRead += 1;

          if (pagesRead === 1 && pageUsers.length === 0) {
            skipTarget(profile.username, targetIndex);
            break;
          }

          const hasMore = Boolean(page.next_max_id) && page.has_more !== false && pageUsers.length > 0;
          const reachedSafetyCap = pagesRead >= FOLLOWERS_PAGE_SAFETY_LIMIT;
          const willContinue = hasMore && !reachedSafetyCap;
          const toFollow: UserNode[] = [];

          for (const raw of pageUsers) {
            const identity = extractUserIdentities(raw);
            const alreadySeen =
              identity.ids.some(id => seenIds.has(id)) || (identity.username !== "" && seenIds.has(identity.username));
            for (const id of identity.ids) {
              seenIds.add(id);
            }
            if (identity.username) {
              seenIds.add(identity.username);
            }
            if (alreadySeen) {
              continue;
            }

            const isViewer = viewerId !== null && identity.ids.includes(viewerId);
            const alreadyConnected = Boolean(
              raw.friendship_status?.following || raw.friendship_status?.outgoing_request || identity.ids.includes(profile.id),
            );
            if (isViewer || alreadyConnected) {
              skipped += 1;
              continue;
            }

            toFollow.push({
              ...rawFriendshipUserToUserNode(raw, Boolean(raw.friendship_status?.followed_by)),
              followed_by_viewer: false,
              requested_by_viewer: false,
            });
          }

          const inner = progressFor(followed + failed + skipped, profile.followerCount);
          remember(targetIndex, profile.username, inner);
          setToast({
            show: true,
            text: t(lang, "followProgress", targetIndex + 1, targets.length, targetLabel(profile.username), followed, skipped),
          });

          for (let index = 0; index < toFollow.length; index += 1) {
            if (cancelled) {
              return;
            }
            await waitIfPaused();
            if (cancelled) {
              return;
            }

            const user = toFollow[index];
            const csrftoken = getCookie("csrftoken");
            let success = false;
            let actionBlocked = false;
            if (csrftoken === null) {
              success = false;
            } else {
              try {
                let result = await followUser(user.id);
                let rateRetries = 0;
                while (result.rateLimited && rateRetries < 3 && !cancelled) {
                  rateRetries += 1;
                  const waitSeconds = RATE_LIMIT_COOLDOWN_SECONDS * rateRetries;
                  for (let sec = waitSeconds; sec > 0; sec -= 1) {
                    if (cancelled) {
                      return;
                    }
                    setToast({ show: true, text: t(lang, "rateLimitPause", sec) });
                    await sleep(1000);
                  }
                  setToast({ show: false });
                  result = await followUser(user.id);
                }
                success = result.success;
                actionBlocked = result.actionBlocked;
                if (!success) {
                  console.warn(`Follow for ${user.username} failed:`, result.data);
                }
              } catch (e) {
                console.error(e);
                success = false;
              }
            }

            followAttempts += 1;
            if (success) {
              followed += 1;
              consecutiveBlocks = 0;
            } else {
              failed += 1;
            }
            if (actionBlocked) {
              consecutiveBlocks += 1;
            }

            setState(prevState => {
              if (prevState.status !== "following") {
                return prevState;
              }
              return {
                ...prevState,
                percentage: overallPercentage(targetIndex, progressFor(followed + failed + skipped, profile.followerCount)),
                followedCount: followed,
                failedCount: failed,
                skippedCount: skipped,
                followLog: [...prevState.followLog, { user, followedSuccessfully: success }],
              };
            });

            if (actionBlocked) {
              if (consecutiveBlocks >= 3) {
                finish("blocked", null, { followed, failed, skipped }, t(lang, "followActionBlockedWarning"), missedTargets);
                return;
              }
              setToast({ show: true, text: t(lang, "followActionBlockedContinue") });
              await sleep(timings.timeToWaitAfterFiveUnfollows);
              if (cancelled) {
                return;
              }
              continue;
            }

            const lastInPage = index === toFollow.length - 1;
            if (lastInPage && !willContinue) {
              break;
            }
            await sleepBetweenFollows(followAttempts);
            if (cancelled) {
              return;
            }
          }

          if (cancelled) {
            return;
          }
          if (!willContinue) {
            if (reachedSafetyCap && hasMore) {
              setToast({ show: true, text: t(lang, "followTargetSkipped", targetLabel(profile.username)) });
            }
            break;
          }

          maxId = page.next_max_id;
          await paceNextPage();
        }
        } catch (e) {
          console.error(`Follow target ${token} failed:`, e);
          if (!cancelled) {
            skipTarget(token, targetIndex);
          }
        }
      }

      if (!cancelled) {
        finish(
          "completed",
          null,
          { followed, failed, skipped },
          t(lang, "followCompleted", targets.length, followed, skipped, failed, missedTargets.length),
          missedTargets,
        );
      }
      } finally {
        if (location.href !== originalHref) {
          history.replaceState(history.state, "", originalHref);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // Dependency array not entirely legit, but works this way. TODO: Find a way to fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  useEffect(() => {
    let cancelled = false;

    const waitIfPaused = async () => {
      while (scanningPausedRef.current && !cancelled) {
        await sleep(1000);
      }
    };

    const run = async () => {
      if (state.status !== "reels") {
        return;
      }
      await runReelCollabs({
        preview: isLocalPreview,
        lang,
        timings,
        shouldAbort: () => cancelled,
        waitIfPaused,
        onProgress: progress => {
          if (progress.toast !== undefined) {
            setToast(progress.toast === null ? { show: false } : { show: true, text: progress.toast });
          }
          setState(prevState => {
            if (prevState.status !== "reels") {
              return prevState;
            }
            return {
              ...prevState,
              percentage: progress.percentage,
              outcome: progress.outcome,
              banner: progress.banner !== undefined ? progress.banner : prevState.banner,
              checkedCount: progress.checkedCount,
              sentCount: progress.sentCount,
              skippedCount: progress.skippedCount,
              failedCount: progress.failedCount,
              currentUsername: progress.currentUsername,
              log: progress.entry ? [...prevState.log, progress.entry] : prevState.log,
            };
          });
        },
      });
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  let markup: React.JSX.Element;
  switch (state.status) {
    case "initial":
      markup = <NotSearching onScan={onScan} onFollow={onFollow} onReels={onReels} lang={lang} cachedScan={cachedScan} onLoadCached={onLoadCached}></NotSearching>;
      break;

    case "scanning": {
      markup = <Searching
        state={state}
        handleScanFilter={handleScanFilter}
        toggleUser={toggleUser}
        pauseScan={pauseScan}
        setState={setState}
        scanningPaused={scanningPaused}
        UserCheckIcon={UserCheckIcon}
        UserUncheckIcon={UserUncheckIcon}
        lang={lang}
      ></Searching>;
      break;
    }

    case "unfollowing":
      markup = <Unfollowing
        state={state}
        handleUnfollowFilter={handleUnfollowFilter}
        lang={lang}
      ></Unfollowing>;
      break;

    case "following":
      markup = <Following
        state={state}
        scanningPaused={scanningPaused}
        pauseScan={pauseScan}
        handleLogFilter={handleUnfollowFilter}
        lang={lang}
      ></Following>;
      break;

    case "reels":
      markup = <Reels
        state={state}
        scanningPaused={scanningPaused}
        pauseScan={pauseScan}
        handleFilter={handleReelsFilter}
        lang={lang}
      ></Reels>;
      break;

    default:
      assertUnreachable(state);
  }

  const showScanWarning = state.status === "scanning" && state.results.length === 0;

  return (
    <main id="main" role="main" className={`iu ${showScanWarning ? "has-scan-warning" : ""}`}>
      <section className="overlay">
        <Toolbar
          state={state}
          setState={setState}
          isActiveProcess={isActiveProcess}
          toggleAllUsers={toggleAllUsers}
          toggleCurrentePageUsers={toggleCurrentePageUsers}
          setTimings={setTimings}
          currentTimings={timings}
          whitelistedUsers={state.status === "scanning" ? state.whitelistedResults : loadWhitelist()}
          onWhitelistUpdate={onWhitelistUpdate}
          lang={lang}
          onLanguageChange={handleLanguageChange}
        ></Toolbar>

        {markup}

        {toast.show && <Toast show={toast.show} message={toast.text} onClose={() => setToast({ show: false })} />}
      </section>
    </main>
  );
}

if (location.hostname !== INSTAGRAM_HOSTNAME && !isLocalPreview) {
  alert("Can be used only on Instagram routes");
} else {
  document.title = "Instagram Automation";
  document.body.innerHTML = "";
  render(<App />, document.body);
}
