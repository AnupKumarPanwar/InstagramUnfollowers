import {
  INSTAGRAM_ASBD_ID,
  INSTAGRAM_WEB_APP_ID,
  RATE_LIMIT_COOLDOWN_SECONDS,
  REEL_COLLAB_BIO_KEYWORD,
  REEL_COLLAB_LINK,
  REEL_COLLAB_MAX_FOLLOWERS,
  REELS_CONTACTED_STORAGE_KEY,
  REELS_CURSOR_STORAGE_KEY,
  REELS_PAGE_SAFETY_LIMIT,
} from "../constants/constants";
import { ReelLogEntry, ReelLogReason } from "../model/reel-log-entry";
import { Timings } from "../model/timings";
import { UserNode } from "../model/user";
import { Language, t } from "./i18n";
import { getCookie, refreshInstagramWebTokens, sleep } from "./utils";

export type ReelRunOutcome = "running" | "completed" | "blocked" | "failed";
export type ReelBanner = "done" | "limit" | "interrupted" | "blocked" | "failed";

export interface ReelCollabProgress {
  readonly percentage: number;
  readonly outcome: ReelRunOutcome;
  readonly banner?: ReelBanner | null;
  readonly checkedCount: number;
  readonly sentCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly currentUsername: string;
  readonly entry?: ReelLogEntry;
  readonly toast?: string | null;
}

export interface ReelCollabOptions {
  readonly preview: boolean;
  readonly lang: Language;
  readonly timings: Timings;
  readonly shouldAbort: () => boolean;
  readonly waitIfPaused: () => Promise<void>;
  readonly onProgress: (progress: ReelCollabProgress) => void;
}

interface ReelPublisher {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly profilePicUrl: string;
  readonly isPrivate: boolean;
  readonly isVerified: boolean;
}

interface ReelsPage {
  readonly publishers: readonly ReelPublisher[];
  readonly nextMaxId?: string;
  readonly hasMore: boolean;
}

interface PublisherProfile {
  readonly biography: string;
  readonly followerCount: number | null;
}

interface Counts {
  page: number;
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
  currentUsername: string;
}

function loadContacted(): Set<string> {
  try {
    const raw = localStorage.getItem(REELS_CONTACTED_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    const ids = new Set<string>();
    for (const item of parsed) {
      if (typeof item === "string" && item !== "") {
        ids.add(item);
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

function saveContacted(ids: Set<string>): void {
  const list: string[] = [];
  ids.forEach(id => list.push(id));
  try {
    localStorage.setItem(REELS_CONTACTED_STORAGE_KEY, JSON.stringify(list.slice(-4000)));
  } catch {
    // Storage can be full or blocked. The current run still avoids duplicates in memory.
  }
}

function loadCursor(): string | undefined {
  try {
    const value = localStorage.getItem(REELS_CURSOR_STORAGE_KEY);
    if (!value || value === "None" || value === "0") {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

function saveCursor(value: string | undefined): void {
  try {
    if (!value) {
      localStorage.removeItem(REELS_CURSOR_STORAGE_KEY);
      return;
    }
    localStorage.setItem(REELS_CURSOR_STORAGE_KEY, value);
  } catch {
    // Ignore quota and privacy errors. The next run starts at the top of the feed.
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

function kindFor(reason: ReelLogReason): ReelLogEntry["kind"] {
  if (reason === "sent") {
    return "sent";
  }
  if (reason === "lookup" || reason === "dm") {
    return "failed";
  }
  return "skipped";
}

function toUserNode(publisher: ReelPublisher): UserNode {
  return {
    id: publisher.id,
    username: publisher.username,
    full_name: publisher.fullName,
    profile_pic_url: publisher.profilePicUrl,
    is_private: publisher.isPrivate,
    is_verified: publisher.isVerified,
    followed_by_viewer: false,
    follows_viewer: false,
    requested_by_viewer: false,
  };
}

function responseMessage(data: unknown): string {
  const record = asRecord(data);
  if (!record) {
    return "";
  }
  return `${String(record.message ?? "")} ${String(record.feedback_message ?? "")}`;
}

function isActionBlocked(data: unknown): boolean {
  const record = asRecord(data);
  const spam = Boolean(record?.spam);
  return spam || /feedback_required|checkpoint|action_blocked|please wait a few minutes/i.test(responseMessage(data));
}

function isRateLimited(status: number, data: unknown): boolean {
  return !isActionBlocked(data) && (status === 429 || /rate limit/i.test(responseMessage(data)));
}

async function instagramFetch(url: string, body?: URLSearchParams): Promise<{ readonly status: number; readonly data: unknown }> {
  const csrftoken = getCookie("csrftoken") || "";
  const headers: Record<string, string> = {
    accept: "*/*",
    "x-ig-app-id": INSTAGRAM_WEB_APP_ID,
    "x-asbd-id": INSTAGRAM_ASBD_ID,
    "x-requested-with": "XMLHttpRequest",
  };
  if (csrftoken) {
    headers["x-csrftoken"] = csrftoken;
  }
  if (body) {
    headers["content-type"] = "application/x-www-form-urlencoded";
  }
  try {
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers,
      body,
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch (error) {
    console.error(error);
    return { status: 0, data: null };
  }
}

function readPublisher(user: unknown): ReelPublisher | null {
  const record = asRecord(user);
  if (!record) {
    return null;
  }
  const id = record.pk ?? record.pk_id ?? record.id;
  const username = record.username;
  if ((typeof id !== "string" && typeof id !== "number") || typeof username !== "string" || username === "" || /^\d+$/.test(username)) {
    return null;
  }
  return {
    id: String(id),
    username,
    fullName: typeof record.full_name === "string" ? record.full_name : "",
    profilePicUrl: typeof record.profile_pic_url === "string" ? record.profile_pic_url : "",
    isPrivate: Boolean(record.is_private),
    isVerified: Boolean(record.is_verified),
  };
}

function publisherFromItem(item: unknown): ReelPublisher | null {
  const record = asRecord(item);
  if (!record || record.ad_id || record.is_ad || record.ad) {
    return null;
  }
  const media = asRecord(record.media) ?? record;
  return readPublisher(media.user) ?? readPublisher(media.owner) ?? readPublisher(record.user);
}

function parseReelsPage(data: unknown, requestedMaxId: string | undefined): ReelsPage {
  const record = asRecord(data);
  const publishers: ReelPublisher[] = [];
  const seen = new Set<string>();
  const lists = record ? [record.items, record.items_with_ads, record.feed_items] : [];
  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const item of list) {
      const publisher = publisherFromItem(item);
      if (!publisher || seen.has(publisher.id)) {
        continue;
      }
      seen.add(publisher.id);
      publishers.push(publisher);
    }
  }

  const paging = asRecord(record?.paging_info) ?? {};
  const rawNext = paging.max_id ?? record?.next_max_id ?? record?.max_id;
  const nextMaxId = typeof rawNext === "string" || typeof rawNext === "number" ? String(rawNext) : "";
  const usable = nextMaxId !== "" && nextMaxId !== "None" && nextMaxId !== "0" && nextMaxId !== requestedMaxId;
  const moreFlag = paging.more_available ?? record?.more_available;
  return {
    publishers,
    nextMaxId: usable ? nextMaxId : undefined,
    hasMore: usable && moreFlag !== false,
  };
}

function extractProfileUser(data: unknown): Record<string, unknown> | null {
  const root = asRecord(data);
  if (!root) {
    return null;
  }
  const direct = asRecord(root.user);
  if (direct) {
    return direct;
  }
  const nested = asRecord(root.data);
  return asRecord(nested?.user);
}

function readProfile(data: unknown, expectedUsername: string): PublisherProfile | null {
  const user = extractProfileUser(data);
  if (!user) {
    return null;
  }
  const username = typeof user.username === "string" ? user.username : "";
  if (username.toLowerCase() !== expectedUsername.toLowerCase()) {
    return null;
  }
  const followedBy = asRecord(user.edge_followed_by);
  const followerCount = readCount(user.follower_count) ?? readCount(followedBy?.count);
  const hasBiography = Object.prototype.hasOwnProperty.call(user, "biography");
  if (!hasBiography && followerCount === null) {
    return null;
  }
  return {
    biography: typeof user.biography === "string" ? user.biography : "",
    followerCount,
  };
}

function reelsRequestBody(maxId: string | undefined): URLSearchParams {
  const body = new URLSearchParams();
  if (maxId) {
    body.set("max_id", maxId);
  }
  body.set("page_size", "12");
  body.set("include_feed_video", "true");
  body.set("container_module", "clips_viewer_clips_tab");
  return body;
}

type FetchedReelsPage = { readonly page: ReelsPage; readonly endpoint: string };

async function fetchReelsPage(
  maxId: string | undefined,
  endpoint: string | null,
  shouldAbort: () => boolean,
  wait: (seconds: number) => Promise<boolean>,
): Promise<FetchedReelsPage | "blocked" | "fail"> {
  const endpoints = endpoint
    ? [endpoint]
    : [
      "https://www.instagram.com/api/v1/clips/discover/",
      "https://www.instagram.com/api/v1/clips/home/",
    ];
  let refreshed = false;
  let attempt = 0;

  while (!shouldAbort() && attempt <= 3) {
    let sawRetry = false;
    let emptyPage: FetchedReelsPage | null = null;
    for (const url of endpoints) {
      const result = await instagramFetch(url, reelsRequestBody(maxId));
      if (shouldAbort()) {
        return "fail";
      }
      if ((result.status === 401 || result.status === 403) && !refreshed) {
        refreshed = true;
        await refreshInstagramWebTokens();
        sawRetry = true;
        break;
      }
      if (isActionBlocked(result.data)) {
        return "blocked";
      }
      if (isRateLimited(result.status, result.data) || result.status === 0) {
        sawRetry = true;
        continue;
      }
      if (result.status >= 200 && result.status < 300) {
        const page = parseReelsPage(result.data, maxId);
        if (page.publishers.length > 0 || page.hasMore || endpoint === url) {
          return { page, endpoint: url };
        }
        emptyPage = { page, endpoint: url };
      }
    }
    if (emptyPage && !sawRetry) {
      return emptyPage;
    }
    if (!sawRetry) {
      return "fail";
    }
    attempt += 1;
    if (attempt > 3) {
      return "fail";
    }
    const keepGoing = await wait(RATE_LIMIT_COOLDOWN_SECONDS * attempt);
    if (!keepGoing) {
      return "fail";
    }
  }
  return "fail";
}

async function fetchPublisherProfile(
  publisher: ReelPublisher,
  shouldAbort: () => boolean,
  wait: (seconds: number) => Promise<boolean>,
): Promise<PublisherProfile | "fail"> {
  const urls = [
    `https://www.instagram.com/api/v1/users/${encodeURIComponent(publisher.id)}/info/`,
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(publisher.username)}`,
  ];
  let attempt = 0;
  while (!shouldAbort() && attempt <= 3) {
    let sawRetry = false;
    for (const url of urls) {
      const result = await instagramFetch(url);
      if (shouldAbort()) {
        return "fail";
      }
      const profile = readProfile(result.data, publisher.username);
      if (profile) {
        return profile;
      }
      if (isRateLimited(result.status, result.data) || result.status === 0) {
        sawRetry = true;
      }
    }
    if (!sawRetry) {
      return "fail";
    }
    attempt += 1;
    if (attempt > 3) {
      return "fail";
    }
    const keepGoing = await wait(RATE_LIMIT_COOLDOWN_SECONDS * attempt);
    if (!keepGoing) {
      return "fail";
    }
  }
  return "fail";
}

interface DirectResult {
  readonly success: boolean;
  readonly actionBlocked: boolean;
  readonly rateLimited: boolean;
}

async function sendHighlightLink(userId: string): Promise<DirectResult> {
  const csrftoken = getCookie("csrftoken");
  if (csrftoken === null || !/^\d+$/.test(userId)) {
    return { success: false, actionBlocked: false, rateLimited: false };
  }
  const clientContext = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const body = new URLSearchParams();
  body.set("recipient_users", `[[${userId}]]`);
  body.set("client_context", clientContext);
  body.set("mutation_token", clientContext);
  body.set("action", "send_item");
  body.set("text", REEL_COLLAB_LINK);
  const result = await instagramFetch("https://www.instagram.com/api/v1/direct_v2/threads/broadcast/text/", body);
  const actionBlocked = isActionBlocked(result.data);
  const rateLimited = isRateLimited(result.status, result.data);
  const status = asRecord(result.data)?.status;
  const success = result.status >= 200 && result.status < 300 && status !== "fail" && !actionBlocked && !rateLimited;
  if (!success) {
    console.warn(`Message to ${userId} failed:`, result.data);
  }
  return { success, actionBlocked, rateLimited };
}

function createEmitter(options: ReelCollabOptions, counts: Counts) {
  return (outcome: ReelRunOutcome, extra?: { readonly entry?: ReelLogEntry; readonly toast?: string | null; readonly banner?: ReelBanner | null }) => {
    const percentage = outcome === "completed"
      ? 100
      : Math.min(99, Math.round((counts.page / REELS_PAGE_SAFETY_LIMIT) * 100));
    options.onProgress({
      percentage,
      outcome,
      checkedCount: counts.checked,
      sentCount: counts.sent,
      skippedCount: counts.skipped,
      failedCount: counts.failed,
      currentUsername: counts.currentUsername,
      ...(extra?.banner !== undefined ? { banner: extra.banner } : {}),
      ...(extra?.entry ? { entry: extra.entry } : {}),
      ...(extra?.toast !== undefined ? { toast: extra.toast } : {}),
    });
  };
}

function remember(counts: Counts, reason: ReelLogReason, publisher: ReelPublisher, followerCount: number | null): ReelLogEntry {
  if (reason === "sent") {
    counts.sent += 1;
  } else if (reason === "lookup" || reason === "dm") {
    counts.failed += 1;
  } else {
    counts.skipped += 1;
  }
  return {
    user: toUserNode(publisher),
    kind: kindFor(reason),
    reason,
    followerCount,
  };
}

async function runPreview(options: ReelCollabOptions, counts: Counts, emit: ReturnType<typeof createEmitter>): Promise<void> {
  const samples: ReadonlyArray<{ readonly publisher: ReelPublisher; readonly reason: ReelLogReason; readonly followerCount: number | null }> = [
    {
      publisher: { id: "reel-1", username: "mina.frames", fullName: "Mina Flores", profilePicUrl: "", isPrivate: false, isVerified: false },
      reason: "sent",
      followerCount: 840,
    },
    {
      publisher: { id: "reel-2", username: "orbit.studio", fullName: "Orbit Studio", profilePicUrl: "", isPrivate: false, isVerified: true },
      reason: "followers",
      followerCount: 12000,
    },
    {
      publisher: { id: "reel-3", username: "paper.lane", fullName: "Paper Lane", profilePicUrl: "", isPrivate: true, isVerified: false },
      reason: "bio",
      followerCount: 430,
    },
    {
      publisher: { id: "reel-4", username: "north.room", fullName: "North Room", profilePicUrl: "", isPrivate: false, isVerified: false },
      reason: "sent",
      followerCount: 1900,
    },
    {
      publisher: { id: "reel-5", username: "quiet.desk", fullName: "Quiet Desk", profilePicUrl: "", isPrivate: false, isVerified: false },
      reason: "dm",
      followerCount: 220,
    },
    {
      publisher: { id: "reel-6", username: "already.sent", fullName: "Already Sent", profilePicUrl: "", isPrivate: false, isVerified: false },
      reason: "already",
      followerCount: null,
    },
  ];

  counts.page = 1;
  for (const sample of samples) {
    if (options.shouldAbort()) {
      return;
    }
    await options.waitIfPaused();
    if (options.shouldAbort()) {
      return;
    }
    counts.currentUsername = sample.publisher.username;
    if (sample.reason !== "already") {
      counts.checked += 1;
    }
    emit("running");
    await sleep(700);
    if (options.shouldAbort()) {
      return;
    }
    const entry = remember(counts, sample.reason, sample.publisher, sample.followerCount);
    emit("running", { entry });
  }
  if (!options.shouldAbort()) {
    emit("completed", {
      banner: "done",
      toast: t(options.lang, "reelsCompleted", counts.checked, counts.sent, counts.skipped, counts.failed),
    });
  }
}

export async function runReelCollabs(options: ReelCollabOptions): Promise<void> {
  const counts: Counts = { page: 0, checked: 0, sent: 0, skipped: 0, failed: 0, currentUsername: "" };
  const emit = createEmitter(options, counts);
  emit("running");

  if (options.preview) {
    await runPreview(options, counts, emit);
    return;
  }

  const countdown = async (seconds: number): Promise<boolean> => {
    for (let remaining = seconds; remaining > 0; remaining -= 1) {
      if (options.shouldAbort()) {
        return false;
      }
      emit("running", { toast: t(options.lang, "rateLimitPause", remaining) });
      await sleep(1000);
    }
    if (!options.shouldAbort()) {
      emit("running", { toast: null });
    }
    return !options.shouldAbort();
  };

  const pace = async (baseMs: number, longWaitMs: number, completedCount: number): Promise<boolean> => {
    const jitter = Math.floor(Math.random() * Math.max(baseMs * 0.2, 1));
    await sleep(baseMs + jitter);
    if (options.shouldAbort()) {
      return false;
    }
    if (completedCount > 0 && completedCount % 5 === 0) {
      emit("running", {
        toast: t(options.lang, "sleepingSafety", Math.round(longWaitMs / 1000)),
      });
      await sleep(longWaitMs);
      if (options.shouldAbort()) {
        return false;
      }
      emit("running", { toast: null });
    }
    return true;
  };

  if (getCookie("csrftoken") === null || getCookie("ds_user_id") === null) {
    emit("failed", { banner: "failed", toast: t(options.lang, "reelsFailed") });
    return;
  }

  const viewerId = getCookie("ds_user_id");
  const contacted = loadContacted();
  const seen = new Set<string>();
  let maxId = loadCursor();
  let usingSavedCursor = maxId !== undefined;
  let endpoint: string | null = null;
  let lookups = 0;
  let messageAttempts = 0;
  let consecutiveBlocks = 0;

  if (usingSavedCursor) {
    emit("running", { toast: t(options.lang, "reelsResuming") });
  }

  while (counts.page < REELS_PAGE_SAFETY_LIMIT && !options.shouldAbort()) {
    await options.waitIfPaused();
    if (options.shouldAbort()) {
      return;
    }

    const pageResult = await fetchReelsPage(maxId, endpoint, options.shouldAbort, countdown);
    if (options.shouldAbort()) {
      return;
    }
    if (pageResult === "blocked") {
      emit("blocked", { banner: "blocked", toast: t(options.lang, "reelsBlocked") });
      return;
    }
    if (pageResult === "fail" || (pageResult.page.publishers.length === 0 && !pageResult.page.hasMore)) {
      if (usingSavedCursor) {
        usingSavedCursor = false;
        maxId = undefined;
        saveCursor(undefined);
        continue;
      }
      if (counts.page === 0 && pageResult === "fail") {
        emit("failed", { banner: "failed", toast: t(options.lang, "reelsFailed") });
        return;
      }
      saveCursor(undefined);
      emit("completed", {
        banner: pageResult === "fail" ? "interrupted" : "done",
        toast: t(
          options.lang,
          pageResult === "fail" ? "reelsFeedStopped" : "reelsCompleted",
          counts.checked,
          counts.sent,
          counts.skipped,
          counts.failed,
        ),
      });
      return;
    }

    endpoint = pageResult.endpoint;
    const reelPage = pageResult.page;
    usingSavedCursor = false;
    counts.page += 1;
    emit("running");

    for (const publisher of reelPage.publishers) {
      if (options.shouldAbort()) {
        return;
      }
      await options.waitIfPaused();
      if (options.shouldAbort()) {
        return;
      }
      if (seen.has(publisher.id) || publisher.id === viewerId) {
        continue;
      }
      seen.add(publisher.id);
      counts.currentUsername = publisher.username;

      if (contacted.has(publisher.id)) {
        emit("running", { entry: remember(counts, "already", publisher, null) });
        continue;
      }

      counts.checked += 1;
      emit("running");
      const profile = await fetchPublisherProfile(publisher, options.shouldAbort, countdown);
      if (options.shouldAbort()) {
        return;
      }

      let reason: ReelLogReason;
      let followerCount: number | null = null;
      let sent = false;
      if (profile === "fail") {
        reason = "lookup";
      } else {
        followerCount = profile.followerCount;
        const matchesFollowers = profile.followerCount !== null && profile.followerCount < REEL_COLLAB_MAX_FOLLOWERS;
        const matchesBio = profile.biography.toLowerCase().includes(REEL_COLLAB_BIO_KEYWORD);
        if (profile.followerCount === null) {
          reason = "unknown_followers";
        } else if (!matchesFollowers) {
          reason = "followers";
        } else if (!matchesBio) {
          reason = "bio";
        } else {
          let delivery = await sendHighlightLink(publisher.id);
          let rateRetries = 0;
          while (delivery.rateLimited && rateRetries < 3 && !options.shouldAbort()) {
            rateRetries += 1;
            const keepGoing = await countdown(RATE_LIMIT_COOLDOWN_SECONDS * rateRetries);
            if (!keepGoing) {
              return;
            }
            delivery = await sendHighlightLink(publisher.id);
          }
          if (options.shouldAbort()) {
            return;
          }
          if (delivery.success) {
            reason = "sent";
            sent = true;
            consecutiveBlocks = 0;
            contacted.add(publisher.id);
            saveContacted(contacted);
          } else {
            reason = "dm";
            if (delivery.actionBlocked) {
              consecutiveBlocks += 1;
            }
          }
        }
      }

      const entry = remember(counts, reason, publisher, followerCount);
      emit("running", { entry });

      if (consecutiveBlocks >= 3) {
        emit("blocked", { banner: "blocked", toast: t(options.lang, "reelsBlocked") });
        return;
      }
      if (reason === "dm" && consecutiveBlocks > 0) {
        emit("running", { toast: t(options.lang, "reelsActionBlockedContinue") });
        await sleep(options.timings.timeToWaitAfterFiveUnfollows);
        if (options.shouldAbort()) {
          return;
        }
        emit("running", { toast: null });
        continue;
      }

      let paced: boolean;
      if (sent || reason === "dm") {
        messageAttempts += 1;
        paced = await pace(options.timings.timeBetweenUnfollows, options.timings.timeToWaitAfterFiveUnfollows, messageAttempts);
      } else {
        lookups += 1;
        paced = await pace(options.timings.timeBetweenSearchCycles, options.timings.timeToWaitAfterFiveSearchCycles, lookups);
      }
      if (!paced) {
        return;
      }
    }

    if (!reelPage.hasMore || !reelPage.nextMaxId) {
      saveCursor(undefined);
      emit("completed", {
        banner: "done",
        toast: t(options.lang, "reelsCompleted", counts.checked, counts.sent, counts.skipped, counts.failed),
      });
      return;
    }
    maxId = reelPage.nextMaxId;
    saveCursor(maxId);
    await sleep(options.timings.timeBetweenSearchCycles);
  }

  if (!options.shouldAbort()) {
    emit("completed", {
      banner: "limit",
      toast: t(options.lang, "reelsSafetyStop", REELS_PAGE_SAFETY_LIMIT, counts.checked, counts.sent, counts.skipped, counts.failed),
    });
  }
}
