// VisaScore Calculation Logic - Country-Specific Scoring
// Maximum score varies by country, capped at specified limits

export interface VisaScoreInput {
  country: string;
  purpose: 'tourist' | 'business' | 'student' | 'work';
  travelHistoryTier1: boolean;
  travelHistoryTier2: boolean;
  travelHistoryTier3: boolean;
  yearlyIncome: 'below_3lac' | '3_to_5lac' | '5_to_10lac' | '10_to_17lac' | 'above_17lac';
  yearlyIncomeAmount?: number;
  employmentType: 'salaried' | 'business';
  // Salaried documents
  docSalarySlip?: boolean;
  docItr3Years?: boolean;
  docCompanyNoc?: boolean;
  docPersonalBankStatement?: boolean;
  // Business documents
  docCompanyRegistration?: boolean;
  docBusinessItr3Years?: boolean;
  docFirmBankStatement?: boolean;
  docBusinessPersonalBankStatement?: boolean;
}

export function getIncomeBracket(amount: number): VisaScoreInput['yearlyIncome'] {
  if (amount >= 1700000) return 'above_17lac';
  if (amount >= 1000000) return '10_to_17lac';
  if (amount >= 500000) return '5_to_10lac';
  if (amount >= 300000) return '3_to_5lac';
  return 'below_3lac';
}

export interface CountryScoreConfig {
  maxScore: number;
  baseScore: number;
  tier1Bonus: number;
  tier2Bonus: number;
  tier3Bonus: number;
  incomeScores: {
    below_3lac: number;
    '3_to_5lac': number;
    '5_to_10lac': number;
    '10_to_17lac': number;
    above_17lac: number;
  };
}

// Country-specific scoring configurations
export const countryConfigs: Record<string, CountryScoreConfig> = {
  'United States of America': {
    maxScore: 90,
    baseScore: 40,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 1,
      '5_to_10lac': 5,
      '10_to_17lac': 10,
      above_17lac: 15,
    },
  },
  'Canada': {
    maxScore: 95,
    baseScore: 45,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 1,
      '5_to_10lac': 5,
      '10_to_17lac': 10,
      above_17lac: 15,
    },
  },
  'United Kingdom': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 19,
      above_17lac: 24,
    },
  },
  'Schengen Area': {
    maxScore: 95,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 18,
      above_17lac: 24,
    },
  },
  'Australia': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 21,
      above_17lac: 24,
    },
  },
  'New Zealand': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 21,
      above_17lac: 24,
    },
  },
  'Japan': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 22,
      above_17lac: 24,
    },
  },
  'South Africa': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 22,
      above_17lac: 24,
    },
  },
  'South Korea': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 22,
      above_17lac: 24,
    },
  },
  'Brazil': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 22,
      above_17lac: 24,
    },
  },
  'Switzerland': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 22,
      above_17lac: 24,
    },
  },
  'France': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 22,
      above_17lac: 24,
    },
  },
  'Turkey': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 22,
      above_17lac: 24,
    },
  },
  'Ireland': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 22,
      above_17lac: 24,
    },
  },
  'Other European Countries': {
    maxScore: 99,
    baseScore: 50,
    tier1Bonus: 20,
    tier2Bonus: 10,
    tier3Bonus: 5,
    incomeScores: {
      below_3lac: 0,
      '3_to_5lac': 5,
      '5_to_10lac': 10,
      '10_to_17lac': 20,
      above_17lac: 24,
    },
  },
};

// Default config for unlisted countries
const defaultConfig: CountryScoreConfig = {
  maxScore: 99,
  baseScore: 50,
  tier1Bonus: 20,
  tier2Bonus: 10,
  tier3Bonus: 5,
  incomeScores: {
    below_3lac: 0,
    '3_to_5lac': 5,
    '5_to_10lac': 10,
    '10_to_17lac': 20,
    above_17lac: 24,
  },
};

export function calculateVisaScore(
  input: VisaScoreInput,
  customConfigs?: Record<string, CountryScoreConfig>
): { score: number; category: 'Low' | 'Medium' | 'High' } {
  const configs = customConfigs || countryConfigs;
  const config = configs[input.country] || defaultConfig;
  
  // Start with base score
  let score = config.baseScore;
  
  // Add travel history bonus (only highest tier counts - mutually exclusive)
  if (input.travelHistoryTier1) {
    score += config.tier1Bonus;
  } else if (input.travelHistoryTier2) {
    score += config.tier2Bonus;
  } else if (input.travelHistoryTier3) {
    score += config.tier3Bonus;
  }
  
  // Add income bonus
  score += config.incomeScores[input.yearlyIncome] || 0;
  
  // Document completeness bonus: +2 per checked tier if all docs are complete
  const allDocsComplete = input.employmentType === 'salaried'
    ? !!(input.docSalarySlip && input.docItr3Years && input.docCompanyNoc && input.docPersonalBankStatement)
    : !!(input.docCompanyRegistration && input.docBusinessItr3Years && input.docFirmBankStatement && input.docBusinessPersonalBankStatement);
  
  if (allDocsComplete) {
    let tierBonus = 0;
    if (input.travelHistoryTier1) tierBonus += 2;
    if (input.travelHistoryTier2) tierBonus += 2;
    if (input.travelHistoryTier3) tierBonus += 2;
    score += tierBonus;
  }
  
  // Cap at country's max score
  score = Math.min(score, config.maxScore);
  
  // Determine category
  let category: 'Low' | 'Medium' | 'High';
  if (score < 40) {
    category = 'Low';
  } else if (score < 70) {
    category = 'Medium';
  } else {
    category = 'High';
  }
  
  return { score, category };
}

export function getApprovalSuggestions(
  input: VisaScoreInput,
  score: number
): string[] {
  const suggestions: string[] = [];
  
  if (!input.travelHistoryTier1 && !input.travelHistoryTier2 && !input.travelHistoryTier3) {
    suggestions.push('Build travel history by visiting visa-free or e-visa countries first');
  } else if (!input.travelHistoryTier1 && input.travelHistoryTier3) {
    suggestions.push('Travel to major countries like US, UK, Canada, Schengen, Australia, NZ to boost your score significantly');
  } else if (!input.travelHistoryTier1 && input.travelHistoryTier2) {
    suggestions.push('Consider traveling to major destinations like US, UK, Canada for maximum travel history bonus');
  }
  
  if (input.yearlyIncome === 'below_3lac' || input.yearlyIncome === '3_to_5lac') {
    suggestions.push('Increasing your documented yearly income above ₹10 Lakhs significantly improves approval chances');
  } else if (input.yearlyIncome === '5_to_10lac') {
    suggestions.push('Income above ₹17 Lakhs provides the highest income bonus for visa approval');
  }
  
  if (score < 50) {
    suggestions.push('Consider applying to countries with easier visa requirements first to build travel history');
    suggestions.push('Prepare comprehensive documentation including travel itinerary and hotel bookings');
  }
  
  if (score >= 70) {
    suggestions.push('Your profile looks strong! Ensure all documents are accurate, complete, and match your application');
  }
  
  if (suggestions.length === 0) {
    suggestions.push('Maintain strong financial documentation and consistent travel patterns');
  }
  
  return suggestions.slice(0, 4);
}

export const popularCountries = [
  'United States of America',
  'Canada',
  'United Kingdom',
  'Schengen Area',
  'Australia',
  'New Zealand',
  'Japan',
  'South Africa',
  'South Korea',
  'Brazil',
  'Switzerland',
  'France',
  'Turkey',
  'Ireland',
  'Other European Countries',
];

export const tier1Countries = [
  'Australia',
  'New Zealand',
  'United States',
  'Canada',
  'United Kingdom',
  'Schengen',
];

export const tier2Countries = [
  'Japan',
  'South Africa',
  'South Korea',
  'Brazil',
];

export const tier3Countries = [
  'Thailand',
  'Singapore',
  'Malaysia',
  'Hong Kong',
  'Macau',
  'China',
  'Vietnam',
  'Azerbaijan',
  'Other Asian Countries',
];

export const incomeRanges = [
  { value: 'below_3lac', label: 'Below ₹3 Lakhs' },
  { value: '3_to_5lac', label: '₹3 - 5 Lakhs' },
  { value: '5_to_10lac', label: '₹5 - 10 Lakhs' },
  { value: '10_to_17lac', label: '₹10 - 17 Lakhs' },
  { value: 'above_17lac', label: 'Above ₹17 Lakhs' },
];
