const REPOSITORY = "nortonyuen-oss/heung_shing_simulator";
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`;

const numberFormatter = new Intl.NumberFormat("zh-Hant");
const dateFormatter = new Intl.DateTimeFormat("zh-Hant-HK", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const assetMatchers = {
  "mac-arm64": (asset) => /^The\.City\.of\.Heung\.Shing-[\d.]+-arm64\.dmg$/i.test(asset.name),
  "mac-x64": (asset) => /^The\.City\.of\.Heung\.Shing-[\d.]+-x64\.dmg$/i.test(asset.name),
  "windows-setup": (asset) => /^The\.City\.of\.Heung\.Shing\.Setup\.[\d.]+\.exe$/i.test(asset.name),
  "windows-portable": (asset) => /^The\.City\.of\.Heung\.Shing\.[\d.]+\.exe$/i.test(asset.name),
};

function setText(selector, text) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = text;
  });
}

function formatCount(value) {
  return numberFormatter.format(Number(value) || 0);
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

function updateAssetDownloadCounts(latestRelease) {
  const assets = latestRelease.assets || [];

  document.querySelectorAll("[data-download-count]").forEach((element) => {
    const asset = findAsset(assets, element.dataset.downloadCount);

    element.textContent = asset ? `${formatCount(getAssetDownloadCount(asset))} 次下載` : "暫未有下載數";
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
    const latestRelease = publicReleases[0] || releases[0];

    if (!latestRelease) {
      throw new Error("No GitHub releases found");
    }

    const latestDownloads = sumReleaseDownloads(latestRelease);
    const allDownloads = publicReleases.reduce((total, release) => total + sumReleaseDownloads(release), 0);
    const tagName = latestRelease.tag_name || "最新版本";
    const publishedAt = latestRelease.published_at ? new Date(latestRelease.published_at) : null;

    setText("[data-latest-version]", tagName);
    setText("[data-latest-downloads]", formatCount(latestDownloads));
    setText("[data-all-downloads]", formatCount(allDownloads));

    if (publishedAt && !Number.isNaN(publishedAt.getTime())) {
      setText("[data-latest-published]", `${dateFormatter.format(publishedAt)}發布`);
    }

    if (latestRelease.html_url) {
      updateReleaseLinks(latestRelease.html_url);
    }

    updateAssetDownloadCounts(latestRelease);
  } catch (error) {
    setText("[data-latest-downloads]", "暫未提供");
    setText("[data-all-downloads]", "暫未提供");
    setText("[data-download-count]", "下載數暫時讀不到");
    console.warn("Unable to load GitHub release stats.", error);
  }
}

function setupViewCounterFallback() {
  document.querySelectorAll(".badge-value img").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const fallback = document.createElement("span");
        fallback.className = "stat-note";
        fallback.textContent = "瀏覽次數暫未提供";
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
