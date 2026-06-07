const CACHE_KEY = 'lottovision:lottery-results:v1';
const CACHE_TTL_MS = 30 * 60 * 1000;
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

const LOTTERY_SOURCES = {
  southAfricaPowerball: {
    id: 'south-africa-powerball',
    country: 'South Africa',
    game: 'PowerBall',
    sourceUrl: 'https://www.lotto.net/south-africa-powerball/results',
    drawDays: [2, 5],
  },
  megaMillions: {
    id: 'mega-millions',
    country: 'USA',
    game: 'Mega Millions',
    sourceUrl: 'https://www.valottery.com/data/draw-games/megamillions',
    drawDays: [2, 5],
  },
  ukLotto: {
    id: 'uk-lotto',
    country: 'UK',
    game: 'UK Lotto',
    sourceUrl: 'https://www.beatlottery.co.uk/lotto/results-checker',
    drawDays: [3, 6],
  },
};

const FALLBACK_RESULTS = [
  {
    id: LOTTERY_SOURCES.southAfricaPowerball.id,
    country: LOTTERY_SOURCES.southAfricaPowerball.country,
    game: LOTTERY_SOURCES.southAfricaPowerball.game,
    jackpot: 'R18 Million',
    lastDrawDate: 'Friday 5 June 2026',
    lastDrawNumbers: ['02', '16', '33', '37', '43'],
    bonusLabel: 'PowerBall',
    bonusNumber: '06',
    nextDrawDate: 'Tuesday 9 June 2026',
    sourceName: 'Lotto.net',
    sourceUrl: LOTTERY_SOURCES.southAfricaPowerball.sourceUrl,
    status: 'Fallback snapshot',
  },
  {
    id: LOTTERY_SOURCES.megaMillions.id,
    country: LOTTERY_SOURCES.megaMillions.country,
    game: LOTTERY_SOURCES.megaMillions.game,
    jackpot: '$392 Million',
    lastDrawDate: 'Friday 5 June 2026',
    lastDrawNumbers: ['13', '30', '50', '52', '66'],
    bonusLabel: 'Mega Ball',
    bonusNumber: '02',
    nextDrawDate: 'Tuesday 9 June 2026',
    sourceName: 'Virginia Lottery',
    sourceUrl: LOTTERY_SOURCES.megaMillions.sourceUrl,
    status: 'Fallback snapshot',
  },
  {
    id: LOTTERY_SOURCES.ukLotto.id,
    country: LOTTERY_SOURCES.ukLotto.country,
    game: LOTTERY_SOURCES.ukLotto.game,
    jackpot: 'GBP 2,000,000',
    lastDrawDate: 'Saturday 6 June 2026',
    lastDrawNumbers: ['08', '10', '26', '30', '35', '42'],
    bonusLabel: 'Bonus',
    bonusNumber: '50',
    nextDrawDate: 'Wednesday 10 June 2026',
    sourceName: 'BeatLottery.co.uk',
    sourceUrl: LOTTERY_SOURCES.ukLotto.sourceUrl,
    status: 'Fallback snapshot',
  },
];

const padNumber = (value) => value.toString().padStart(2, '0');

const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim();

const getBrowserStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
};

const getCachedResults = () => {
  const storage = getBrowserStorage();

  if (!storage) {
    return null;
  }

  try {
    const cached = JSON.parse(storage.getItem(CACHE_KEY));

    if (!cached || Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      return null;
    }

    return cached.results;
  } catch {
    return null;
  }
};

const cacheResults = (results) => {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      CACHE_KEY,
      JSON.stringify({
        cachedAt: Date.now(),
        results,
      })
    );
  } catch {
    // Cache failures should never block live draw data.
  }
};

const fetchText = async (url) => {
  try {
    const response = await fetch(url);

    if (response.ok) {
      return response.text();
    }
  } catch {
    // Retry through the public proxy below when direct cross-origin fetch fails.
  }

  const proxiedResponse = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);

  if (!proxiedResponse.ok) {
    throw new Error(`Unable to load lottery source: ${url}`);
  }

  return proxiedResponse.text();
};

const htmlToText = (html) => {
  if (typeof window !== 'undefined' && window.DOMParser) {
    return normalizeWhitespace(
      new window.DOMParser().parseFromString(html, 'text/html').body.textContent || ''
    );
  }

  return normalizeWhitespace(html.replace(/<[^>]+>/g, ' '));
};

const parseLooseDate = (value) => {
  const cleaned = value.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const parsed = new Date(cleaned);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date, locale = undefined) => {
  if (!date) {
    return 'Pending update';
  }

  return date.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const getNextDrawDate = (drawDays, fromDate) => {
  const start = fromDate ? new Date(fromDate) : new Date();
  const candidate = new Date(start);

  candidate.setDate(candidate.getDate() + 1);

  for (let offset = 0; offset < 14; offset += 1) {
    const next = new Date(candidate);
    next.setDate(candidate.getDate() + offset);

    if (drawDays.includes(next.getDay())) {
      return next;
    }
  }

  return null;
};

const normalizeResult = (result) => ({
  ...result,
  lastDrawNumbers: result.lastDrawNumbers.map(padNumber),
  bonusNumber: result.bonusNumber ? padNumber(result.bonusNumber) : null,
  fetchedAt: new Date().toISOString(),
  status: result.status || 'Live source',
});

const parseSouthAfricaPowerball = (html) => {
  const text = htmlToText(html);
  const source = LOTTERY_SOURCES.southAfricaPowerball;
  const latestDate = text.match(/Latest Results and Numbers\s+([A-Za-z]+ \d{1,2} [A-Za-z]+ \d{4})/);

  if (!latestDate) {
    throw new Error('Could not parse South Africa PowerBall draw date.');
  }

  const latestSection = text.slice(latestDate.index);
  const numbersSection = latestSection.match(/Latest Results and Numbers\s+[A-Za-z]+ \d{1,2} [A-Za-z]+ \d{4}\s+(.+?)\s+Powerball/i);
  const numbers = (numbersSection?.[1].match(/\b\d{1,2}\b/g) || []).slice(0, 6);
  const jackpot = latestSection.match(/Next Jackpot\s+(R[\d,.]+(?:\s+Million)?)/i)?.[1]
    || latestSection.match(/Jackpot\s+(R[\d,.]+)/i)?.[1]
    || 'Pending update';
  const drawDate = parseLooseDate(latestDate[1]);

  if (numbers.length < 6) {
    throw new Error('Could not parse South Africa PowerBall numbers.');
  }

  return normalizeResult({
    id: source.id,
    country: source.country,
    game: source.game,
    jackpot,
    lastDrawDate: formatDate(drawDate),
    lastDrawNumbers: numbers.slice(0, 5),
    bonusLabel: 'PowerBall',
    bonusNumber: numbers[5],
    nextDrawDate: formatDate(getNextDrawDate(source.drawDays, drawDate)),
    sourceName: 'Lotto.net',
    sourceUrl: source.sourceUrl,
  });
};

const parseMegaMillions = (html) => {
  const text = htmlToText(html);
  const source = LOTTERY_SOURCES.megaMillions;
  const jackpot = text.match(/Current Estimated Jackpot\s+\$?([\d,.]+\s+(?:MILLION|BILLION))/i)?.[1];
  const nextDrawDate = text.match(/Next Drawing:\s+([A-Za-z]+ \d{2}\/\d{2}\/\d{4})/i)?.[1];
  const latestDraw = text.match(/Latest Drawing:\s+([A-Za-z]+ \d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})/i);

  if (!latestDraw || !jackpot || !nextDrawDate) {
    throw new Error('Could not parse Mega Millions results.');
  }

  return normalizeResult({
    id: source.id,
    country: source.country,
    game: source.game,
    jackpot: `$${jackpot.replace(/\b(million|billion)\b/i, (match) => (
      match.charAt(0).toUpperCase() + match.slice(1).toLowerCase()
    ))}`,
    lastDrawDate: formatDate(parseLooseDate(latestDraw[1].replace(/^[A-Za-z]+ /, ''))),
    lastDrawNumbers: latestDraw.slice(2, 7),
    bonusLabel: 'Mega Ball',
    bonusNumber: latestDraw[7],
    nextDrawDate: formatDate(parseLooseDate(nextDrawDate.replace(/^[A-Za-z]+ /, ''))),
    sourceName: 'Virginia Lottery',
    sourceUrl: source.sourceUrl,
  });
};

const parseUkLotto = (html) => {
  const text = htmlToText(html);
  const source = LOTTERY_SOURCES.ukLotto;
  const drawDate = text.match(/Draw date:\s+(.+?)\s+(\d{2}\s+\d{2}\s+\d{2}\s+\d{2}\s+\d{2}\s+\d{2})\s+BONUS\s+(\d{2})/i);
  const jackpot = text.match(/Next jackpot is:\s+([A-ZGBP]*\s?[\d,]+|GBP\s?[\d,]+|\u00A3[\d,]+)/i)?.[1];
  const nextDrawDate = text.match(/Next draw:\s+(.+?)\s+Get Winning Tips/i)?.[1];

  if (!drawDate || !jackpot || !nextDrawDate) {
    throw new Error('Could not parse UK Lotto results.');
  }

  return normalizeResult({
    id: source.id,
    country: source.country,
    game: source.game,
    jackpot: jackpot.replace('\u00A3', 'GBP '),
    lastDrawDate: formatDate(parseLooseDate(drawDate[1]), 'en-GB'),
    lastDrawNumbers: drawDate[2].split(' '),
    bonusLabel: 'Bonus',
    bonusNumber: drawDate[3],
    nextDrawDate: formatDate(parseLooseDate(nextDrawDate), 'en-GB'),
    sourceName: 'BeatLottery.co.uk',
    sourceUrl: source.sourceUrl,
  });
};

const loadPublicResults = async () => {
  const loaders = [
    fetchText(LOTTERY_SOURCES.southAfricaPowerball.sourceUrl).then(parseSouthAfricaPowerball),
    fetchText(LOTTERY_SOURCES.megaMillions.sourceUrl).then(parseMegaMillions),
    fetchText(LOTTERY_SOURCES.ukLotto.sourceUrl).then(parseUkLotto),
  ];

  const settled = await Promise.allSettled(loaders);
  const liveResults = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  const fallbackById = new Map(FALLBACK_RESULTS.map((result) => [result.id, normalizeResult(result)]));

  liveResults.forEach((result) => {
    fallbackById.set(result.id, result);
  });

  return Array.from(fallbackById.values());
};

export const getLotteryResults = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh) {
    const cached = getCachedResults();

    if (cached) {
      return cached;
    }
  }

  const results = await loadPublicResults();
  cacheResults(results);

  return results;
};

export const lotteryResultSources = Object.values(LOTTERY_SOURCES);
