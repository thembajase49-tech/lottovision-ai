const LOTTERY_RANGE = {
  min: 1,
  max: 49,
  count: 6,
};

const MODE_PROFILES = {
  'AI Smart': {
    hotWeight: 0.42,
    coldWeight: 0.22,
    trendWeight: 0.28,
    balanceWeight: 0.08,
  },
  'Hot Numbers': {
    hotWeight: 0.72,
    coldWeight: 0.04,
    trendWeight: 0.2,
    balanceWeight: 0.04,
  },
  'Cold Numbers': {
    hotWeight: 0.08,
    coldWeight: 0.72,
    trendWeight: 0.08,
    balanceWeight: 0.12,
  },
  'Trend Hunter': {
    hotWeight: 0.24,
    coldWeight: 0.08,
    trendWeight: 0.62,
    balanceWeight: 0.06,
  },
};

const COUNTRY_GAME_MATCH = {
  'South Africa': ['south-africa-powerball', 'powerball'],
  USA: ['mega-millions', 'mega millions'],
  UK: ['uk-lotto', 'uk lotto'],
};

const padNumber = (value) => value.toString().padStart(2, '0');

const getDrawDate = (value) => {
  if (!value) {
    return null;
  }

  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const getAllLotteryNumbers = () => (
  Array.from({ length: LOTTERY_RANGE.max - LOTTERY_RANGE.min + 1 }, (_, index) => (
    padNumber(index + LOTTERY_RANGE.min)
  ))
);

const getTrendFollowers = (draws) => {
  const followers = new Set();

  draws.slice(0, 3).forEach((draw) => {
    draw.numbers.forEach((number) => {
      const numericNumber = Number(number);

      [numericNumber - 1, numericNumber + 1].forEach((candidate) => {
        if (candidate >= LOTTERY_RANGE.min && candidate <= LOTTERY_RANGE.max) {
          followers.add(padNumber(candidate));
        }
      });
    });
  });

  return [...followers].sort((a, b) => Number(a) - Number(b));
};

const normalizeNumbers = (numbers) => (
  Array.isArray(numbers)
    ? numbers.map((number) => padNumber(Number(number))).filter((number) => number !== 'NaN')
    : []
);

const getCountryLotteryResults = (country, lotteryResults) => {
  const matchers = COUNTRY_GAME_MATCH[country] || [];

  return lotteryResults.filter((result) => (
    result.country === country
    || matchers.some((matcher) => result.id?.includes(matcher) || result.game?.toLowerCase().includes(matcher))
  ));
};

const getHistoricalDraws = (country, lotteryResults, predictionHistory) => {
  const liveDraws = getCountryLotteryResults(country, lotteryResults).map((result) => ({
    source: 'official-result',
    numbers: normalizeNumbers(result.lastDrawNumbers),
    date: getDrawDate(result.lastDrawDate) || getDrawDate(result.fetchedAt) || new Date(),
  }));

  const generatedHistory = predictionHistory
    .filter((item) => item.country === country)
    .map((item) => ({
      source: 'prediction-history',
      numbers: normalizeNumbers(item.numbers),
      date: getDrawDate(item.createdAt) || new Date(0),
    }));

  return [...liveDraws, ...generatedHistory]
    .filter((draw) => draw.numbers.length > 0)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
};

const incrementPair = (pairCounts, first, second, weight) => {
  const pairKey = [first, second].sort((a, b) => Number(a) - Number(b)).join('-');
  pairCounts[pairKey] = (pairCounts[pairKey] || 0) + weight;
};

export const analyzeHistoricalDraws = (country, lotteryResults, predictionHistory) => {
  const allNumbers = getAllLotteryNumbers();
  const frequency = Object.fromEntries(allNumbers.map((number) => [number, 0]));
  const recentFrequency = Object.fromEntries(allNumbers.map((number) => [number, 0]));
  const pairFrequencies = {};
  const historicalDraws = getHistoricalDraws(country, lotteryResults, predictionHistory);

  historicalDraws.forEach((draw, drawIndex) => {
    const recencyWeight = Math.max(0.35, 1 - drawIndex * 0.08);
    const sourceWeight = draw.source === 'official-result' ? 1.35 : 0.72;
    const weight = recencyWeight * sourceWeight;

    draw.numbers.forEach((number, numberIndex) => {
      frequency[number] = (frequency[number] || 0) + weight;

      if (drawIndex < 5) {
        recentFrequency[number] = (recentFrequency[number] || 0) + weight;
      }

      draw.numbers.slice(numberIndex + 1).forEach((pairedNumber) => {
        incrementPair(pairFrequencies, number, pairedNumber, weight);
      });
    });
  });

  const rankedByFrequency = allNumbers
    .map((number) => ({
      number,
      count: frequency[number] || 0,
      recentCount: recentFrequency[number] || 0,
    }))
    .sort((a, b) => b.count - a.count || Number(a.number) - Number(b.number));

  const hotNumbers = rankedByFrequency.slice(0, 12).map((item) => item.number);
  const coldNumbers = [...rankedByFrequency]
    .sort((a, b) => a.count - b.count || Number(a.number) - Number(b.number))
    .slice(0, 12)
    .map((item) => item.number);
  const recentTrends = [...rankedByFrequency]
    .sort((a, b) => b.recentCount - a.recentCount || b.count - a.count || Number(a.number) - Number(b.number))
    .slice(0, 12)
    .map((item) => item.number);
  const topPairs = Object.entries(pairFrequencies)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([pair, count]) => ({ pair, count }));
  const trendFollowers = getTrendFollowers(historicalDraws);

  return {
    country,
    drawCount: historicalDraws.length,
    frequency,
    hotNumbers,
    coldNumbers,
    pairFrequencies,
    topPairs,
    recentTrends,
    trendFollowers,
    latestDraws: historicalDraws.slice(0, 5),
  };
};

const getPairScore = (selectedNumbers, candidate, pairFrequencies) => (
  selectedNumbers.reduce((score, selectedNumber) => {
    const pairKey = [selectedNumber, candidate].sort((a, b) => Number(a) - Number(b)).join('-');
    return score + (pairFrequencies[pairKey] || 0);
  }, 0)
);

const getNumberScore = (number, analysis, mode) => {
  const profile = MODE_PROFILES[mode] || MODE_PROFILES['AI Smart'];
  const maxFrequency = Math.max(...Object.values(analysis.frequency), 1);
  const frequencyScore = (analysis.frequency[number] || 0) / maxFrequency;
  const hotScore = analysis.hotNumbers.includes(number) ? 1 : frequencyScore;
  const coldScore = analysis.coldNumbers.includes(number) ? 1 : 1 - frequencyScore;
  const trendScore = mode === 'Trend Hunter'
    ? (
      analysis.trendFollowers.includes(number)
        ? 1
        : (analysis.recentTrends.includes(number) ? 0.85 : 0.2)
    )
    : (
      analysis.recentTrends.includes(number)
        ? 1
        : (analysis.latestDraws[0]?.numbers.includes(number) ? 0.75 : 0.2)
    );
  const balanceScore = Number(number) % 2 === 0 ? 0.48 : 0.52;

  return (
    hotScore * profile.hotWeight
    + coldScore * profile.coldWeight
    + trendScore * profile.trendWeight
    + balanceScore * profile.balanceWeight
  );
};

const selectNextNumber = (candidates, selectedNumbers, analysis, mode) => (
  candidates
    .map((number) => ({
      number,
      score: getNumberScore(number, analysis, mode)
        + getPairScore(selectedNumbers, number, analysis.pairFrequencies) * 0.08,
    }))
    .sort((a, b) => b.score - a.score || Number(a.number) - Number(b.number))[0]?.number
);

const diversifyNumbers = (numbers, analysis, mode) => {
  const selected = [];
  const allNumbers = getAllLotteryNumbers();

  if (mode === 'AI Smart') {
    [
      analysis.hotNumbers.slice(0, 2),
      [...analysis.trendFollowers, ...analysis.recentTrends].slice(0, 2),
      analysis.coldNumbers.slice(0, 2),
    ].flat().forEach((number) => {
      if (selected.length < LOTTERY_RANGE.count && !selected.includes(number)) {
        selected.push(number);
      }
    });

    while (selected.length < LOTTERY_RANGE.count) {
      const candidates = allNumbers.filter((number) => !selected.includes(number));
      const nextNumber = selectNextNumber(candidates, selected, analysis, mode);

      if (!nextNumber) {
        break;
      }

      selected.push(nextNumber);
    }

    return selected.sort((a, b) => Number(a) - Number(b));
  }

  const preferredPools = {
    'Hot Numbers': analysis.hotNumbers,
    'Cold Numbers': analysis.coldNumbers,
    'Trend Hunter': [
      ...analysis.trendFollowers,
      ...analysis.topPairs.flatMap((item) => item.pair.split('-')),
      ...analysis.recentTrends,
    ],
  };
  const pool = [...new Set([...(preferredPools[mode] || preferredPools['AI Smart']), ...numbers, ...allNumbers])];

  while (selected.length < LOTTERY_RANGE.count) {
    const candidates = pool.filter((number) => !selected.includes(number));
    const nextNumber = selectNextNumber(candidates, selected, analysis, mode);

    if (!nextNumber) {
      break;
    }

    selected.push(nextNumber);
  }

  return selected.sort((a, b) => Number(a) - Number(b));
};

const getConfidenceScore = (numbers, analysis, mode) => {
  const profile = MODE_PROFILES[mode] || MODE_PROFILES['AI Smart'];
  const maxFrequency = Math.max(...Object.values(analysis.frequency), 1);
  const averageFrequency = numbers.reduce((total, number) => (
    total + ((analysis.frequency[number] || 0) / maxFrequency)
  ), 0) / numbers.length;
  const trendHits = numbers.filter((number) => analysis.recentTrends.includes(number)).length / numbers.length;
  const pairHits = numbers.reduce((total, number, index) => (
    total + numbers.slice(index + 1).filter((pairedNumber) => (
      analysis.pairFrequencies[[number, pairedNumber].sort((a, b) => Number(a) - Number(b)).join('-')]
    )).length
  ), 0);
  const modeWeight = profile.hotWeight + profile.trendWeight + profile.coldWeight;
  const rawScore = 62
    + averageFrequency * 14
    + trendHits * 10
    + Math.min(pairHits, 4) * 2
    + Math.min(analysis.drawCount, 20) * 0.35
    + modeWeight * 4;

  return `${Math.min(94, Math.max(64, Math.round(rawScore)))}%`;
};

export const generateAnalyzedPrediction = ({
  country,
  mode,
  lotteryResults,
  predictionHistory,
}) => {
  const analysis = analyzeHistoricalDraws(country, lotteryResults, predictionHistory);
  const seedNumbers = [
    ...analysis.hotNumbers,
    ...analysis.coldNumbers,
    ...analysis.recentTrends,
  ];
  const numbers = diversifyNumbers(seedNumbers, analysis, mode);

  return {
    numbers,
    confidence: getConfidenceScore(numbers, analysis, mode),
    analysis,
  };
};
