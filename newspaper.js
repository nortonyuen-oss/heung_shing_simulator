// Tabloid-style "newspaper extra" popup for special milestone events (council built,
// stock exchange built, ...). Content is entirely rule/i18n-driven — no AI involved.

const NEWSPAPER_EVENT_DEFS = {
  council_built: {
    headlineKey: 'newspaper.council.headline',
    subheadKey: 'newspaper.council.subhead',
    bodyKeys: ['newspaper.council.body1', 'newspaper.council.body2'],
    quoteKey: 'newspaper.council.quote',
    portraitCaptionKey: 'newspaper.council.portraitCaption',
    portraitOfficialId: 'chief_executive',
  },
  stock_exchange_built: {
    headlineKey: 'newspaper.stockExchange.headline',
    subheadKey: 'newspaper.stockExchange.subhead',
    bodyKeys: ['newspaper.stockExchange.body1', 'newspaper.stockExchange.body2'],
    quoteKey: 'newspaper.stockExchange.quote',
    portraitCaptionKey: 'newspaper.stockExchange.portraitCaption',
    portraitOfficialId: 'treasury_head',
  },
  typhoon_signal8: {
    headlineKey: 'newspaper.typhoon8.headline',
    subheadKey: 'newspaper.typhoon8.subhead',
    bodyKeys: ['newspaper.typhoon8.body1', 'newspaper.typhoon8.body2'],
    quoteKey: 'newspaper.typhoon8.quote',
    portraitCaptionKey: 'newspaper.typhoon8.portraitCaption',
    portraitOfficialId: 'observatory_head',
  },
};

function showNewspaperExtra(eventId, params = {}) {
  const def = NEWSPAPER_EVENT_DEFS[eventId];
  const dialog = document.getElementById('newspaper-dialog');
  if (!def || !dialog) return;

  const cityName = city.name || getDefaultCityName();
  const textParams = { city: cityName, ...params };

  setTextContent('newspaper-masthead', t('newspaper.masthead', textParams));
  setTextContent('newspaper-ribbon', t('newspaper.ribbon.extra'));
  setTextContent('newspaper-date', `${tMonth(city.month)} ${city.year}`);
  setTextContent('newspaper-headline', t(def.headlineKey, textParams));
  setTextContent('newspaper-subhead', t(def.subheadKey, textParams));

  const body = document.getElementById('newspaper-body');
  if (body) {
    body.replaceChildren(...def.bodyKeys.map((key) => {
      const p = document.createElement('p');
      p.textContent = t(key, textParams);
      return p;
    }));
  }

  const quoteBlock = document.getElementById('newspaper-quote-block');
  const official = def.portraitOfficialId ? getCouncilOfficialDefinition(def.portraitOfficialId) : null;
  if (quoteBlock) {
    quoteBlock.hidden = !def.quoteKey;
    setTextContent('newspaper-quote', def.quoteKey ? t(def.quoteKey, textParams) : '');
    setTextContent('newspaper-quote-attribution', official ? getCouncilNewsOfficialDisplayName(official.id) : '');
  }

  const portraitWrap = document.getElementById('newspaper-portrait-wrap');
  const portraitImg = document.getElementById('newspaper-portrait');
  if (portraitWrap && portraitImg) {
    portraitWrap.hidden = !official;
    if (official) {
      portraitImg.src = official.portrait;
      portraitImg.alt = getCouncilNewsOfficialDisplayName(official.id);
      setTextContent('newspaper-portrait-caption', t(def.portraitCaptionKey, textParams));
    }
  }

  if (typeof showDialog === 'function') showDialog('newspaper-dialog');
}

function announceCouncilBuiltNewspaper() {
  showNewspaperExtra('council_built', { population: (city.population || 0).toLocaleString() });
}

function announceStockExchangeBuiltNewspaper() {
  const hsi = Math.round(Number(city.stockMarket?.hsi ?? HSI_BASE_LEVEL));
  showNewspaperExtra('stock_exchange_built', { hsi: hsi.toLocaleString() });
}
