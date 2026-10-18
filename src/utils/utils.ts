import { UserNode } from "../model/user";
import { DEFAULT_USERS_PER_SEARCH_CYCLE, INSTAGRAM_ASBD_ID, INSTAGRAM_FOLLOW_ASBD_ID, INSTAGRAM_WEB_APP_ID, RATE_LIMIT_COOLDOWN_SECONDS, UNFOLLOWERS_PER_PAGE, WITHOUT_PROFILE_PICTURE_URL_IDS } from "../constants/constants";
import { ScanningTab } from "../model/scanning-tab";
import { ScanningFilter } from "../model/scanning-filter";
import { UnfollowLogEntry } from "../model/unfollow-log-entry";
import { FollowLogEntry } from "../model/follow-log-entry";
import { UnfollowFilter } from "../model/unfollow-filter";

export async function copyListToClipboard(nonFollowersList: readonly UserNode[], alertMessage: string = 'List copied to clipboard!'): Promise<void> {
  const sortedList = [...nonFollowersList].sort((a, b) => (a.username > b.username ? 1 : -1));

  let output = '';
  sortedList.forEach(user => {
    output += user.username + '\n';
  });

  await navigator.clipboard.writeText(output);
  alert(alertMessage);
}

export function exportToJSON(users: readonly UserNode[]) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(users, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href",     dataStr);
  downloadAnchorNode.setAttribute("download", "instagram_unfollowers.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export function exportToCSV(users: readonly UserNode[]) {
  const headers = ['id', 'username', 'full_name', 'is_verified', 'is_private', 'profile_pic_url'];
  const rows = users.map(user => [
    user.id,
    user.username,
    `"${user.full_name.replace(/"/g, '""')}"`,
    user.is_verified,
    user.is_private,
    user.profile_pic_url
  ]);
  
  const csvContent = "data:text/csv;charset=utf-8," 
    + headers.join(",") + "\n" 
    + rows.map(e => e.join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "instagram_unfollowers.csv");
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function getMaxPage(nonFollowersList: readonly UserNode[]): number {
  const pageCalc = Math.ceil(nonFollowersList.length / UNFOLLOWERS_PER_PAGE);
  return pageCalc < 1 ? 1 : pageCalc;
}

export function getCurrentPageUnfollowers(nonFollowersList: readonly UserNode[], currentPage: number): readonly UserNode[] {
  const sortedList = [...nonFollowersList].sort((a, b) => (a.username > b.username ? 1 : -1));
  const startIndex = UNFOLLOWERS_PER_PAGE * (currentPage - 1);
  return sortedList.slice(startIndex, startIndex + UNFOLLOWERS_PER_PAGE);
}

export function isWithoutProfilePicture(user: UserNode): boolean {
  if (!user.profile_pic_url) {
    return true;
  }
  return WITHOUT_PROFILE_PICTURE_URL_IDS.some(id => user.profile_pic_url.includes(id));
}

export function getUsersForDisplay(
  results: readonly UserNode[],
  whitelistedResults: readonly UserNode[],
  currentTab: ScanningTab,
  searchTerm: string,
  filter: ScanningFilter,
): readonly UserNode[] {
  const users: UserNode[] = [];
  for (const result of results) {
    const isWhitelisted = whitelistedResults.find(user => user.id === result.id) !== undefined;
    switch (currentTab) {
      case "non_whitelisted":
        if (isWhitelisted) {
          continue;
        }
        break;
      case "whitelisted":
        if (!isWhitelisted) {
          continue;
        }
        break;
      default:
        assertUnreachable(currentTab);
    }
    if (!filter.showPrivate && result.is_private) {
      continue;
    }
    if (!filter.showVerified && result.is_verified) {
      continue;
    }
    // Scans only keep accounts that don't follow back; this also hides
    // mutuals stored by older cached scans.
    if (result.follows_viewer) {
      continue;
    }
    if (!filter.showWithOutProfilePicture && isWithoutProfilePicture(result)) {
      continue;
    }
    const userMatchesSearchTerm =
      result.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      result.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    if (searchTerm !== "" && !userMatchesSearchTerm) {
      continue;
    }
    users.push(result);
  }
  return users;
}

export function getFollowLogForDisplay(log: readonly FollowLogEntry[], searchTerm: string, filter: UnfollowFilter) {
  const entries: FollowLogEntry[] = [];
  for (const entry of log) {
    if (!filter.showSucceeded && entry.followedSuccessfully) {
      continue;
    }
    if (!filter.showFailed && !entry.followedSuccessfully) {
      continue;
    }
    const userMatchesSearchTerm = entry.user.username.toLowerCase().includes(searchTerm.toLowerCase());
    if (searchTerm !== "" && !userMatchesSearchTerm) {
      continue;
    }
    entries.push(entry);
  }
  return entries;
}

export function getUnfollowLogForDisplay(log: readonly UnfollowLogEntry[], searchTerm: string, filter: UnfollowFilter) {
  const entries: UnfollowLogEntry[] = [];
  for (const entry of log) {
    if (!filter.showSucceeded && entry.unfollowedSuccessfully) {
      continue;
    }
    if (!filter.showFailed && !entry.unfollowedSuccessfully) {
      continue;
    }
    const userMatchesSearchTerm = entry.user.username.toLowerCase().includes(searchTerm.toLowerCase());
    if (searchTerm !== "" && !userMatchesSearchTerm) {
      continue;
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * When writing a switch-case with a finite number of cases, use this function in the
 * `default` clause of switch-case statements for exhaustive checking. This will make
 * TS complain until ALL cases are handled. For example, if we have a switch-case
 * in-which we evaluate every possible status of a component's state, if we add this
 * to the default clause and then add a new status to the state type, TS will complain
 * and force us to handle it as well, thus avoiding forgetting it.
 */
export function assertUnreachable(_value: never): never {
  throw new Error('Statement should be unreachable');
}

export function sleep(ms: number): Promise<any> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length !== 2) {
    return null;
  }
  return parts.pop()!.split(';').shift()!;
}

export function unfollowUserUrlGenerator(idToUnfollow: string): string {
  return `https://www.instagram.com/web/friendships/${idToUnfollow}/unfollow/`;
}

interface InstagramWebTokens {
  lsd: string | null;
  fbDtsg: string | null;
  rev: string | null;
  av: string | null;
  wwwClaim: string | null;
  webSessionId: string;
  asbdId: string;
}

function firstMatch(source: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function createWebSessionId(): string {
  const part = () => Math.random().toString(36).slice(2, 8);
  return `${part()}:${part()}:${part()}`;
}

function parseInstagramWebTokens(source: string, webSessionId: string): InstagramWebTokens {
  return {
    lsd: firstMatch(source, [
      /"LSD",\[\],\{"token":"([^"]+)"/,
      /\\"LSD\\",\[\],\{\\"token\\":\\"([^\\"]+)\\"/,
    ]),
    fbDtsg: firstMatch(source, [
      /"DTSGInitialData",\[\],\{"token":"([^"]+)"/,
      /\\"DTSGInitialData\\",\[\],\{\\"token\\":\\"([^\\"]+)\\"/,
    ]),
    rev: firstMatch(source, [
      /"server_revision":(\d+)/,
      /"rollout_hash":"(\d+)"/,
      /"__spin_r":(\d+)/,
    ]),
    av: firstMatch(source, [
      /"NON_FACEBOOK_USER_ID":"(\d+)"/,
      /"fbid_v2":"(\d+)"/,
      /"actorID":"(\d+)"/,
    ]),
    wwwClaim: extractWwwClaim(source),
    webSessionId: firstMatch(source, [
      /"web_session_id":"([a-z0-9]+:[a-z0-9]+:[a-z0-9]+)"/i,
    ]) ?? webSessionId,
    asbdId: firstMatch(source, [
      /"ASBD_ID":"?(\d+)"?/,
      /"asbd_id":"(\d+)"/,
    ]) ?? INSTAGRAM_FOLLOW_ASBD_ID,
  };
}

function extractWwwClaim(source: string): string | null {
  const labeled = firstMatch(source, [
    /"www_claim":"(hmac\.[^"]+)"/,
    /\\"www_claim\\":\\"(hmac\.[^\\"]+)\\"/,
    /"claim":"(hmac\.[^"]+)"/,
    /\\"claim\\":\\"(hmac\.[^\\"]+)\\"/,
  ]);
  if (labeled) {
    return labeled;
  }
  const nearClaim = source.match(/claim[^a-zA-Z0-9]{0,16}(hmac\.[A-Za-z0-9_-]{16,})/i);
  return nearClaim?.[1] ?? null;
}

function readStoredClaim(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    for (const store of [window.sessionStorage, window.localStorage]) {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index) ?? "";
        if (!/claim/i.test(key)) {
          continue;
        }
        const value = store.getItem(key) ?? "";
        const match = value.match(/hmac\.[A-Za-z0-9_-]{16,}/);
        if (match) {
          return match[0];
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function captureInstagramWebTokens(): InstagramWebTokens {
  const source = typeof document === "undefined" ? "" : document.documentElement.innerHTML;
  const tokens = parseInstagramWebTokens(source, createWebSessionId());
  if (!tokens.wwwClaim) {
    tokens.wwwClaim = readStoredClaim();
  }
  return tokens;
}

// Captured when this script loads, before the app replaces the Instagram page.
// Later responses and a fresh HTML fetch replace claim, csrf, and dtsg.
let instagramWebTokens = captureInstagramWebTokens();

function absorbResponseHeaders(response: Response): void {
  const claim = response.headers.get("x-ig-set-www-claim");
  if (claim && claim !== "0") {
    instagramWebTokens = { ...instagramWebTokens, wwwClaim: claim };
  }
}

export async function refreshInstagramWebTokens(): Promise<void> {
  try {
    const response = await fetch("https://www.instagram.com/", {
      credentials: "same-origin",
      headers: { accept: "text/html" },
    });
    absorbResponseHeaders(response);
    mergeTokensFromHtml(await response.text());
  } catch (e) {
    console.error("Could not refresh Instagram headers.", e);
  }
}

function mergeTokensFromHtml(html: string): void {
  const fresh = parseInstagramWebTokens(html, instagramWebTokens.webSessionId);
  instagramWebTokens = {
    lsd: fresh.lsd ?? instagramWebTokens.lsd,
    fbDtsg: fresh.fbDtsg ?? instagramWebTokens.fbDtsg,
    rev: fresh.rev ?? instagramWebTokens.rev,
    av: fresh.av ?? instagramWebTokens.av,
    wwwClaim: fresh.wwwClaim ?? instagramWebTokens.wwwClaim,
    webSessionId: instagramWebTokens.webSessionId,
    asbdId: fresh.asbdId || instagramWebTokens.asbdId,
  };
}

function instagramApiHeaders(): Record<string, string> {
  const csrftoken = getCookie("csrftoken") || "";
  const headers: Record<string, string> = {
    accept: "*/*",
    "x-ig-app-id": INSTAGRAM_WEB_APP_ID,
    "x-asbd-id": instagramWebTokens.asbdId || INSTAGRAM_FOLLOW_ASBD_ID,
    "x-requested-with": "XMLHttpRequest",
    "x-ig-max-touch-points": "0",
    "x-web-session-id": instagramWebTokens.webSessionId,
  };
  if (csrftoken) {
    headers["x-csrftoken"] = csrftoken;
  }
  if (instagramWebTokens.wwwClaim) {
    headers["x-ig-www-claim"] = instagramWebTokens.wwwClaim;
  }
  return headers;
}

export interface FollowResult {
  readonly success: boolean;
  readonly actionBlocked: boolean;
  readonly rateLimited: boolean;
  readonly data: unknown;
}

function followResponseMessage(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }
  const record = data as { message?: unknown; feedback_message?: unknown; spam?: unknown };
  return `${String(record.message ?? "")} ${String(record.feedback_message ?? "")}`;
}

// HTTP 429 is a pause, the same as a scan retry. It is not an account block.
// The GraphQL follow mutation was answering 429 and the queue treated that as a block.
function isFollowActionBlocked(data: unknown): boolean {
  const message = followResponseMessage(data);
  const spam = Boolean(data && typeof data === "object" && (data as { spam?: boolean }).spam);
  return spam || /feedback_required|checkpoint|action_blocked|please wait a few minutes/i.test(message);
}

// Same request shape as unfollow: csrf, app id, ASBD 129477, and XMLHttpRequest.
// /web/friendships/<id>/follow/ returns the HTML 404 page, so this uses the
// friendships create call with those unfollow headers.
export async function followUser(userId: string): Promise<FollowResult> {
  const csrftoken = getCookie("csrftoken");
  if (csrftoken === null) {
    console.error("csrftoken cookie is null");
    return { success: false, actionBlocked: false, rateLimited: false, data: null };
  }

  const response = await fetch(`https://www.instagram.com/api/v1/friendships/create/${userId}/`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-csrftoken": csrftoken,
      "x-ig-app-id": INSTAGRAM_WEB_APP_ID,
      "x-asbd-id": INSTAGRAM_ASBD_ID,
      "x-requested-with": "XMLHttpRequest",
    },
  });
  const data = await response.json().catch(() => null);
  const message = followResponseMessage(data);
  const actionBlocked = isFollowActionBlocked(data);
  const rateLimited = !actionBlocked && (response.status === 429 || /rate limit/i.test(message));
  const success = response.ok && (data as { status?: string } | null)?.status !== "fail" && !actionBlocked && !rateLimited;
  return { success, actionBlocked, rateLimited, data };
}

export function normalizeInstagramUsername(input: string): string | null {
  const clean = input.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(clean)) {
    return null;
  }
  return clean;
}

export function parseFollowTargets(input: string): { readonly targets: readonly string[]; readonly invalid: readonly string[] } {
  const parts = input.split(/[\s,;]+/).map(part => part.trim()).filter(Boolean);
  const targets: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const stripped = part.replace(/^@+/, "");
    const token = /^\d{2,20}$/.test(stripped) ? stripped : normalizeInstagramUsername(stripped);
    if (token === null) {
      invalid.push(part);
      continue;
    }
    const key = /^\d+$/.test(token) ? token : token.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    targets.push(token);
  }
  return { targets, invalid };
}

export interface InstagramProfile {
  readonly id: string;
  readonly username: string;
  readonly isPrivate: boolean;
  readonly followerCount: number | null;
}

function profileFromApiUser(user: any, fallbackUsername: string): InstagramProfile | null {
  const id = user?.id ?? user?.pk_id ?? user?.pk;
  const username = String(user?.username || fallbackUsername).trim();
  if (id === undefined || id === null || String(id).trim() === '' || !username) {
    return null;
  }
  if (username.toLowerCase() !== fallbackUsername.toLowerCase()) {
    return null;
  }
  const followerCount = user?.edge_followed_by?.count ?? user?.follower_count;
  return {
    id: String(id),
    username,
    isPrivate: Boolean(user?.is_private),
    followerCount: typeof followerCount === 'number' ? followerCount : null,
  };
}

async function readInstagramJson(url: string): Promise<{ readonly status: number; readonly data: any }> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: instagramApiHeaders(),
  });
  absorbResponseHeaders(response);
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function isExplicitProfileMiss(data: any): boolean {
  return /user not found|does not exist/i.test(String(data?.message ?? ''));
}

function isLookupRateLimit(status: number, data: any): boolean {
  return status === 429 || /feedback_required|checkpoint|rate limit|please wait/i.test(String(data?.message ?? ''));
}

export interface ProfileLookupOptions {
  readonly onCooldown?: (secondsRemaining: number) => void;
  readonly shouldAbort?: () => boolean;
}

// Same pause as the unfollow scan: 30s, then 60s, then 90s, with a countdown.
async function waitLikeUnfollowRetry(
  waitSeconds: number,
  options?: ProfileLookupOptions,
): Promise<boolean> {
  for (let sec = waitSeconds; sec > 0; sec--) {
    if (options?.shouldAbort?.()) {
      return false;
    }
    options?.onCooldown?.(sec);
    await sleep(1000);
  }
  options?.onCooldown?.(0);
  return !options?.shouldAbort?.();
}

// Opening the profile page is the same request a browser makes before the
// followers dialog. web_profile_info is what returns HTTP 429.
async function fetchProfileFromPage(username: string): Promise<InstagramProfile | "missing" | null> {
  const response = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    credentials: "same-origin",
    headers: { accept: "text/html" },
  });
  absorbResponseHeaders(response);
  const html = await response.text();
  mergeTokensFromHtml(html);
  if (response.status === 404 || /sorry, this page isn.t available/i.test(html)) {
    return "missing";
  }
  if (!response.ok) {
    return null;
  }
  const id = firstMatch(html, [
    /profilePage_(\d+)/,
    /"user_id":"(\d+)"/,
    /"profile_id":"(\d+)"/,
  ]);
  if (!id) {
    return null;
  }
  const followerCountMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/);
  return {
    id,
    username,
    isPrivate: /"is_private":true/.test(html),
    followerCount: followerCountMatch ? Number(followerCountMatch[1]) : null,
  };
}

// web_profile_info often returns HTTP 400 or 429 for a real account. /web/search/topsearch/
// now returns HTTP 404 for every query, so it is not used and a bare 404 is not treated
// as "this username does not exist."
export async function fetchProfileByUsername(username: string, options?: ProfileLookupOptions): Promise<InstagramProfile> {
  if (options?.shouldAbort?.()) {
    throw new InstagramApiError(0, 'cancelled');
  }
  try {
    const fromPage = await fetchProfileFromPage(username);
    if (fromPage === "missing") {
      throw new InstagramApiError(404, "user not found");
    }
    if (fromPage) {
      options?.onCooldown?.(0);
      return fromPage;
    }
  } catch (e) {
    if (e instanceof InstagramApiError) {
      throw e;
    }
    console.error(`Profile page lookup failed for @${username}:`, e);
  }

  const encoded = encodeURIComponent(username);
  const referer = `https://www.instagram.com/${encoded}/`;
  const requests: Array<{ readonly url: string; readonly referer: string; readonly pick: (data: any) => InstagramProfile | null }> = [
    {
      url: `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encoded}`,
      referer,
      pick: data => profileFromApiUser(data?.data?.user, username),
    },
    {
      url: `https://www.instagram.com/api/v1/users/${encoded}/usernameinfo/`,
      referer,
      pick: data => profileFromApiUser(data?.user, username),
    },
    {
      url: `https://www.instagram.com/api/v1/feed/user/${encoded}/username/?count=1`,
      referer,
      pick: data => profileFromApiUser(data?.user, username),
    },
  ];

  let explicitMiss = false;
  let sawOtherFailure = false;
  let lastStatus = 0;
  const maxRetries = 3;

  for (const request of requests) {
    let retries = 0;
    while (retries <= maxRetries) {
      if (options?.shouldAbort?.()) {
        throw new InstagramApiError(0, 'cancelled');
      }
      let status = 0;
      let data: any = null;
      try {
        const result = await readInstagramJson(request.url);
        status = result.status;
        data = result.data;
      } catch (e) {
        console.error(`Profile lookup failed for @${username}:`, e);
        const isNetworkError = e instanceof TypeError || /fetch|network/i.test(String((e as Error)?.message ?? ''));
        if (isNetworkError && retries < maxRetries) {
          retries++;
          const keepGoing = await waitLikeUnfollowRetry(5 * retries, options);
          if (!keepGoing) {
            throw new InstagramApiError(0, 'cancelled');
          }
          continue;
        }
        sawOtherFailure = true;
        break;
      }

      const profile = request.pick(data);
      if (profile) {
        options?.onCooldown?.(0);
        return profile;
      }
      lastStatus = status;
      if (isLookupRateLimit(status, data) && retries < maxRetries) {
        retries++;
        console.error(`Profile lookup for @${username} returned HTTP ${status}. Retrying like an unfollow scan.`);
        const keepGoing = await waitLikeUnfollowRetry(RATE_LIMIT_COOLDOWN_SECONDS * retries, options);
        if (!keepGoing) {
          throw new InstagramApiError(0, 'cancelled');
        }
        continue;
      }
      if (isExplicitProfileMiss(data)) {
        explicitMiss = true;
      } else if (status !== 200 || data?.status === 'fail') {
        sawOtherFailure = true;
        console.error(`Profile lookup for @${username} returned HTTP ${status}:`, data);
      }
      break;
    }
  }

  if (explicitMiss && !sawOtherFailure) {
    throw new InstagramApiError(404, `Instagram could not find @${username}`);
  }
  throw new InstagramApiError(lastStatus, `Instagram could not resolve @${username}`);
}

function launchProfileSlug(): string | null {
  if (typeof location === "undefined") {
    return null;
  }
  try {
    const part = new URL(location.href).pathname.split("/").filter(Boolean)[0] ?? "";
    if (/^[A-Za-z0-9._]{1,30}$/.test(part) && !/^\d+$/.test(part)) {
      return part;
    }
  } catch {
    return null;
  }
  return null;
}

function usernameFromUrl(href: string): string | null {
  try {
    const part = new URL(href).pathname.split("/").filter(Boolean)[0] ?? "";
    if (/^[A-Za-z0-9._]{1,30}$/.test(part) && !/^\d+$/.test(part)) {
      return part;
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveNumericProfile(userId: string): Promise<InstagramProfile> {
  const fallback: InstagramProfile = { id: userId, username: userId, isPrivate: false, followerCount: null };
  try {
    const response = await fetch(`https://www.instagram.com/${encodeURIComponent(userId)}/`, {
      credentials: "same-origin",
      headers: { accept: "text/html" },
    });
    absorbResponseHeaders(response);
    const html = await response.text();
    mergeTokensFromHtml(html);
    return {
      id: firstMatch(html, [/profilePage_(\d+)/, /"user_id":"(\d+)"/]) ?? userId,
      username: usernameFromUrl(response.url) ?? userId,
      isPrivate: /"is_private":true/.test(html),
      followerCount: null,
    };
  } catch (e) {
    console.error(`Could not open profile ${userId}.`, e);
    return fallback;
  }
}

export async function profileForFollowToken(token: string, options?: ProfileLookupOptions): Promise<InstagramProfile> {
  if (!/^\d+$/.test(token)) {
    return fetchProfileByUsername(token, options);
  }
  if (launchProfileSlug()) {
    return { id: token, username: token, isPrivate: false, followerCount: null };
  }
  return resolveNumericProfile(token);
}

export function isActionBlockedResponse(
  status: number,
  data: { readonly status?: string; readonly spam?: boolean; readonly message?: string } | null,
): boolean {
  return (
    status === 429 ||
    status === 400 ||
    data?.status === 'fail' ||
    data?.spam === true ||
    /feedback_required|checkpoint|action_blocked|block/i.test(String(data?.message ?? ''))
  );
}

export type FriendshipsListKind = 'following' | 'followers';

/**
 * A single user entry as returned by Instagram's private
 * /api/v1/friendships/<id>/following|followers/ REST endpoints. This is a
 * different (and much less rich) shape than the old public GraphQL
 * following-edges endpoint this app used to call, which was the actual
 * cause of scans always completing instantly with 0 results: that GraphQL
 * `query_hash` is a years-old, publicly-known value that Instagram now
 * serves as a structurally-valid but data-empty response (200 OK, correct
 * total count, zero edges, has_next_page: false) rather than an outright
 * error, so the old code had no way to detect the failure.
 */
export interface FriendshipStatus {
  readonly following?: boolean;
  readonly outgoing_request?: boolean;
  readonly followed_by?: boolean;
}

export interface RawFriendshipUser {
  readonly pk: string | number;
  readonly pk_id?: string;
  readonly username: string;
  readonly full_name?: string;
  readonly profile_pic_url: string;
  readonly is_private?: boolean;
  readonly is_verified?: boolean;
  readonly friendship_status?: FriendshipStatus;
}

export interface FriendshipsPage {
  readonly users?: readonly RawFriendshipUser[];
  // Instagram sometimes omits next_max_id even when has_more is true right
  // at the very end of a list; both are checked when deciding to continue.
  readonly next_max_id?: string;
  readonly has_more?: boolean;
}

// `userId` defaults to the logged-in viewer; pass another account's id to read
// that account's following/followers list instead.
export function friendshipsUrlGenerator(kind: FriendshipsListKind, maxId?: string, count: number = DEFAULT_USERS_PER_SEARCH_CYCLE, userId?: string): string {
  const targetId = userId ?? getCookie('ds_user_id');
  const params = new URLSearchParams({ count: String(count) });
  if (kind === "followers" && userId) {
    params.set("search_surface", "follow_list_page");
  }
  if (maxId !== undefined) {
    params.set("max_id", maxId);
  }
  return `https://www.instagram.com/api/v1/friendships/${targetId}/${kind}/?${params.toString()}`;
}

export class InstagramApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    Object.setPrototypeOf(this, InstagramApiError.prototype);
    this.name = 'InstagramApiError';
    this.status = status;
  }
}

export async function fetchFriendshipsPage(kind: FriendshipsListKind, maxId?: string, count?: number, userId?: string): Promise<FriendshipsPage> {
  let refreshed = false;
  let response: Response;
  while (true) {
    response = await fetch(friendshipsUrlGenerator(kind, maxId, count, userId), {
      credentials: "same-origin",
      headers: instagramApiHeaders(),
    });
    absorbResponseHeaders(response);
    if ((response.status === 401 || response.status === 403) && !refreshed) {
      refreshed = true;
      await refreshInstagramWebTokens();
      continue;
    }
    break;
  }
  if (!response.ok) {
    throw new InstagramApiError(response.status, `Instagram returned HTTP ${response.status} while fetching ${kind}`);
  }
  const data = (await response.json()) as any;
  if (data?.status === 'fail' || (!data?.users && data?.message)) {
    throw new InstagramApiError(response.status, data?.message || `Instagram returned failure status while fetching ${kind}`);
  }
  return data as FriendshipsPage;
}

export function rawFriendshipUserToUserNode(raw: RawFriendshipUser, followsViewer: boolean): UserNode {
  return {
    id: String(raw.pk_id ?? raw.pk),
    username: raw.username,
    full_name: raw.full_name ?? '',
    profile_pic_url: raw.profile_pic_url,
    is_private: raw.is_private ?? false,
    is_verified: raw.is_verified ?? false,
    // These endpoints don't expose either of these, and nothing in the app
    // reads them beyond this mapping, so they're set to the values that are
    // true by construction for entries drawn from your own following list.
    followed_by_viewer: true,
    requested_by_viewer: false,
    follows_viewer: followsViewer,
  };
}

export interface FollowerIndex {
  readonly ids: ReadonlySet<string>;
  readonly usernames: ReadonlySet<string>;
}

export function createFollowerIndex(): {
  readonly ids: Set<string>;
  readonly usernames: Set<string>;
} {
  return {
    ids: new Set<string>(),
    usernames: new Set<string>(),
  };
}

export function extractUserIdentities(user: RawFriendshipUser): {
  readonly ids: readonly string[];
  readonly username: string;
} {
  const ids: string[] = [];
  if (user.pk !== undefined && user.pk !== null) {
    const s = String(user.pk).trim();
    if (s) {
      ids.push(s);
    }
  }
  if (user.pk_id) {
    const s = String(user.pk_id).trim();
    if (s && !ids.includes(s)) {
      ids.push(s);
    }
  }
  if ((user as any).id) {
    const s = String((user as any).id).trim();
    if (s && !ids.includes(s)) {
      ids.push(s);
    }
  }
  const username = (user.username ?? "").trim().toLowerCase();
  return { ids, username };
}

export function addFollowerToIndex(
  index: { readonly ids: Set<string>; readonly usernames: Set<string> },
  user: RawFriendshipUser,
): void {
  const { ids, username } = extractUserIdentities(user);
  for (const id of ids) {
    index.ids.add(id);
  }
  if (username) {
    index.usernames.add(username);
  }
}

export function isUserInFollowerIndex(
  index: { readonly ids: ReadonlySet<string>; readonly usernames: ReadonlySet<string> },
  user: RawFriendshipUser,
): boolean {
  const { ids, username } = extractUserIdentities(user);
  if (ids.some(id => index.ids.has(id))) {
    return true;
  }
  if (username && index.usernames.has(username)) {
    return true;
  }
  return false;
}

