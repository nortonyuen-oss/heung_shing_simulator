// UI profile: "desktop" (the classic windowed UI) or "touch" (the phone UI, built in phases).
//
// The profile is resolved once per page load, from `?ui=` (this load only) or the saved
// preference, and again only when the player changes the preference. It is NOT re-evaluated
// on resize or rotation, so turning a phone does not flip the interface (mobile spec §5.4).
// Input capability, storage platform and render quality are separate settings; nothing here
// touches the save format, the simulation speed or the storage layer.

const UI_PROFILE_STORAGE_KEY = 'heung-shing.ui-profile.v1';
const UI_PROFILE_MODES = Object.freeze(['auto', 'desktop', 'touch']);
const UI_PROFILE_AUTO_MAX_WIDTH = 1100;
// Mobile is released as Beta. Resolve automatically on load; explicit preferences
// remain available, and rotation never changes the chosen interface mid-session.
const UI_PROFILE_AUTO_ENABLED = true;
const UI_PROFILE_VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, viewport-fit=cover';

let uiProfilePreference = 'auto';
let uiProfile = 'desktop';

function normalizeUiProfileMode(value) {
  return UI_PROFILE_MODES.includes(value) ? value : null;
}

// Pure, so it can be tested without a browser. Spec §5: the starting rule for "auto" is a
// coarse primary pointer and a CSS viewport narrower than 1100px.
function resolveUiProfile({
  preference = 'auto',
  primaryPointerCoarse = false,
  viewportWidth = Infinity,
  autoEnabled = UI_PROFILE_AUTO_ENABLED,
} = {}) {
  if (preference === 'desktop' || preference === 'touch') return preference;
  return autoEnabled && primaryPointerCoarse && viewportWidth < UI_PROFILE_AUTO_MAX_WIDTH
    ? 'touch'
    : 'desktop';
}

function readUiProfileUrlOverride() {
  try {
    return normalizeUiProfileMode(new URLSearchParams(globalThis.location?.search || '').get('ui'));
  } catch {
    return null;
  }
}

function readStoredUiProfilePreference() {
  try {
    return normalizeUiProfileMode(globalThis.localStorage?.getItem(UI_PROFILE_STORAGE_KEY));
  } catch {
    // Storage blocked: carry on with the default for this session.
    return null;
  }
}

function detectPrimaryPointerCoarse() {
  try {
    return !!globalThis.matchMedia?.('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

// The desktop UI keeps the page without a viewport meta (a phone then lays it out wide, as
// before); the touch UI needs a device-width layout and the safe-area insets.
function applyUiProfileToDocument(profile) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.dataset.uiProfile = profile;
  const head = globalThis.document.head;
  let meta = head?.querySelector('meta[name="viewport"][data-ui-profile-viewport]');
  if (profile === 'touch') {
    if (!meta && head) {
      meta = globalThis.document.createElement('meta');
      meta.name = 'viewport';
      meta.setAttribute('data-ui-profile-viewport', '');
      head.appendChild(meta);
    }
    if (meta) meta.content = UI_PROFILE_VIEWPORT_CONTENT;
  } else if (meta) {
    meta.remove();
  }
}

function computeUiProfile() {
  return resolveUiProfile({
    preference: uiProfilePreference,
    primaryPointerCoarse: detectPrimaryPointerCoarse(),
    viewportWidth: globalThis.innerWidth ?? Infinity,
  });
}

function getUiProfile() {
  return uiProfile;
}

function getUiProfilePreference() {
  return uiProfilePreference;
}

function isTouchUiProfile() {
  return uiProfile === 'touch';
}

function setUiProfilePreference(mode) {
  const next = normalizeUiProfileMode(mode);
  if (!next) return uiProfile;
  uiProfilePreference = next;
  try {
    globalThis.localStorage?.setItem(UI_PROFILE_STORAGE_KEY, next);
  } catch {
    // The choice still applies to this session.
  }
  const previous = uiProfile;
  uiProfile = computeUiProfile();
  applyUiProfileToDocument(uiProfile);
  if (uiProfile !== previous) {
    globalThis.document?.dispatchEvent(new CustomEvent('uiprofilechange', {
      detail: { preference: uiProfilePreference, profile: uiProfile, previous },
    }));
  }
  return uiProfile;
}

function initializeUiProfile() {
  uiProfilePreference = readUiProfileUrlOverride() ?? readStoredUiProfilePreference() ?? 'auto';
  uiProfile = computeUiProfile();
  applyUiProfileToDocument(uiProfile);
}

initializeUiProfile();
