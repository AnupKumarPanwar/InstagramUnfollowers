export const INSTAGRAM_HOSTNAME = "www.instagram.com";
export const UNFOLLOWERS_PER_PAGE = 50;

// The app id Instagram's own web frontend sends on its private REST API
// calls (e.g. /api/v1/friendships/<id>/following/). Required or these
// endpoints behave inconsistently; it is not a secret, just an identifier
// for "the instagram.com web client" and is safe to keep public.
export const INSTAGRAM_WEB_APP_ID = "936619743392459";
export const INSTAGRAM_ASBD_ID = "129477";
// Header and doc id from the web client's usePolarisFollowMutation request.
export const INSTAGRAM_FOLLOW_ASBD_ID = "359341";
export const POLARIS_FOLLOW_DOC_ID = "26508036048874888";
// The followers dialog loads 12 people per request. Larger counts are what the
// script was sending, and Instagram answers those with HTTP 429.
export const FOLLOW_LIST_PAGE_COUNT = 12;

// Page-count safety cap for loading the viewer's own following and followers lists
// (see utils/utils.ts and main.tsx).
export const FOLLOWING_PAGE_SAFETY_LIMIT = 250;
export const FOLLOWERS_PAGE_SAFETY_LIMIT = 250;
// A long safety sleep is taken once every this many scan requests.
export const CHECKS_BEFORE_LONG_SLEEP = 15;
export const RATE_LIMIT_COOLDOWN_SECONDS = 30;
export const REEL_COLLAB_MAX_FOLLOWERS = 2000;
export const REEL_COLLAB_BIO_KEYWORD = "collab";
export const REEL_COLLAB_LINK = "https://www.instagram.com/stories/highlights/17909331147509045/";
export const REELS_PAGE_SAFETY_LIMIT = 80;
export const REELS_CONTACTED_STORAGE_KEY = "iu_reels-contacted";
export const REELS_CURSOR_STORAGE_KEY = "iu_reels-cursor";
export const WHITELISTED_RESULTS_STORAGE_KEY = "iu_whitelisted-results";
export const TIMINGS_STORAGE_KEY = "iu_timings";
export const LAST_SCAN_RESULTS_STORAGE_KEY = "iu_last-scan-results";
export const LAST_SCAN_TIMESTAMP_STORAGE_KEY = "iu_last-scan-time";

//TIMINGS CONSTANTS
export const DEFAULT_TIME_BETWEEN_SEARCH_CYCLES = 1000;
export const DEFAULT_TIME_TO_WAIT_AFTER_FIVE_SEARCH_CYCLES = 10000;
export const DEFAULT_TIME_BETWEEN_UNFOLLOWS = 4000;
export const DEFAULT_TIME_TO_WAIT_AFTER_FIVE_UNFOLLOWS = 300000;
export const DEFAULT_USERS_PER_SEARCH_CYCLE = 50;

// FILTER CONSTANTS
export const WITHOUT_PROFILE_PICTURE_URL_IDS = [
  "44884218_345707102882519_2446069589734326272_n",
  "464760996_1254146839119862_3605321457742435801_n",
];
