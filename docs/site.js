const REPOSITORY = "nortonyuen-oss/heung_shing_simulator";
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`;

const assetMatchers = {
  "mac-arm64": (asset) => /^The\.City\.of\.Heung\.Shing-[\d.]+-arm64\.dmg$/i.test(asset.name),
  "mac-x64": (asset) => /^The\.City\.of\.Heung\.Shing-[\d.]+-x64\.dmg$/i.test(asset.name),
  "windows-setup": (asset) => /^The\.City\.of\.Heung\.Shing\.Setup\.[\d.]+\.exe$/i.test(asset.name),
  "windows-portable": (asset) => /^The\.City\.of\.Heung\.Shing\.[\d.]+\.exe$/i.test(asset.name),
};

let cachedLatestRelease = null;
let cachedReleaseError = null;

function getNumberFormatter() {
  return new Intl.NumberFormat(SITE_INTL_LOCALE[siteCurrentLanguage] || "en-US");
}

function getDateFormatter() {
  return new Intl.DateTimeFormat(SITE_INTL_LOCALE[siteCurrentLanguage] || "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function setText(selector, text) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = text;
  });
}

function formatCount(value) {
  return getNumberFormatter().format(Number(value) || 0);
}

function getAssetDownloadCount(asset) {
  return Number(asset.download_count ?? asset.downloadCount ?? 0) || 0;
}

function isPublicDownloadAsset(asset) {
  return Object.values(assetMatchers).some((matcher) => matcher(asset));
}

function sumReleaseDownloads(release) {
  return (release.assets || [])
    .filter(isPublicDownloadAsset)
    .reduce((total, asset) => total + getAssetDownloadCount(asset), 0);
}

function updateReleaseLinks(url) {
  document.querySelectorAll("[data-release-link]").forEach((link) => {
    link.href = url;
  });
}

function findAsset(assets, key) {
  const matcher = assetMatchers[key];

  if (matcher) {
    return assets.find(matcher);
  }

  return assets.find((asset) => asset.name === key);
}

function formatPublishedDate(publishedAt) {
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return null;
  const formatted = getDateFormatter().format(publishedAt);
  const stats = SITE_TEXT[siteCurrentLanguage].stats;
  return stats.publishedPrefix
    ? `${stats.publishedPrefix}${formatted}`
    : `${formatted}${stats.publishedSuffix || ""}`;
}

function renderReleaseStats() {
  const stats = SITE_TEXT[siteCurrentLanguage].stats;

  if (cachedReleaseError || !cachedLatestRelease) {
    setText("[data-latest-downloads]", stats.notAvailable);
    setText("[data-all-downloads]", stats.notAvailable);
    setText("[data-download-count]", stats.downloadCountNotAvailable);
    return;
  }

  const latestRelease = cachedLatestRelease.latest;
  const publicReleases = cachedLatestRelease.publicReleases;
  const latestDownloads = sumReleaseDownloads(latestRelease);
  const allDownloads = publicReleases.reduce((total, release) => total + sumReleaseDownloads(release), 0);
  const tagName = latestRelease.tag_name || stats.latestVersion;
  const publishedAt = latestRelease.published_at ? new Date(latestRelease.published_at) : null;

  setText("[data-latest-version]", tagName);
  setText("[data-latest-downloads]", `${formatCount(latestDownloads)} ${stats.downloadsUnit}`);
  setText("[data-all-downloads]", `${formatCount(allDownloads)} ${stats.downloadsUnit}`);

  const publishedLabel = formatPublishedDate(publishedAt);
  if (publishedLabel) setText("[data-latest-published]", publishedLabel);

  if (latestRelease.html_url) {
    updateReleaseLinks(latestRelease.html_url);
  }

  const assets = latestRelease.assets || [];
  document.querySelectorAll("[data-download-count]").forEach((element) => {
    const asset = findAsset(assets, element.dataset.downloadCount);
    element.textContent = asset
      ? `${formatCount(getAssetDownloadCount(asset))} ${stats.downloadsUnit}`
      : stats.downloadCountNotAvailable;
  });

  document.querySelectorAll("[data-download-link]").forEach((link) => {
    const asset = findAsset(assets, link.dataset.downloadLink);
    if (asset?.browser_download_url) {
      link.href = asset.browser_download_url;
    }
  });
}

async function loadReleaseStats() {
  try {
    const response = await fetch(RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const releases = await response.json();
    const publicReleases = releases.filter((release) => !release.draft && !release.prerelease);
    const latest = publicReleases[0] || releases[0];

    if (!latest) {
      throw new Error("No GitHub releases found");
    }

    cachedLatestRelease = { latest, publicReleases };
    cachedReleaseError = null;
  } catch (error) {
    cachedReleaseError = error;
    console.warn("Unable to load GitHub release stats.", error);
  }

  renderReleaseStats();
}

function setupViewCounterFallback() {
  document.querySelectorAll(".badge-value img").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const fallback = document.createElement("span");
        fallback.className = "stat-note";
        fallback.textContent = SITE_TEXT[siteCurrentLanguage].stats.viewsNotAvailable;
        image.replaceWith(fallback);
      },
      { once: true },
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupViewCounterFallback();
  loadReleaseStats();
});

// i18n.js applies the initial language on DOMContentLoaded and re-dispatches
// this event on every later switch; re-render already-fetched release stats
// in the new language instead of re-fetching from GitHub.
document.addEventListener("sitelanguagechange", () => {
  renderReleaseStats();
});
