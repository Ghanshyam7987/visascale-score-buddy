// VisaScore Calculation Logic - Country-Specific Scoring
// Maximum score varies by country, capped at specified limits

export interface VisaScoreInput {
  country: string;
  purpose: 'tourist' | 'business' | 'student' | 'work';
  travelHistoryTier1: boolean;
  travelHistoryTier2: boolean;
  travelHistoryTier3: boolean;
  travelHistoryTier4: boolean;
  tier1CountryCount?: number;
  tier2CountryCount?: number;
  tier3CountryCount?: number;
  tier4CountryCount?: number;
  visaIssuedNotTravelled?: boolean;
  visaIssuedNotTravelledCountries?: string[];
  yearlyIncome: 'below_3lac' | '3_to_5lac' | '5_to_10lac' | '10_to_17lac' | 'above_17lac';
  yearlyIncomeAmount?: number;
  sponsorYearlyIncome?: 'below_3lac' | '3_to_5lac' | '5_to_10lac' | '10_to_17lac' | 'above_17lac';
  sponsorYearlyIncomeAmount?: number;
  employmentType: 'salaried' | 'self_business' | 'salaried_sponsored' | 'self_business_sponsored' | 'sponsored_mother' | 'sponsored_father' | 'sponsored_husband';
  visaIssuedNotTravelledCountry?: string;
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
  // Sponsor documents (combined salaried + business)
  docSponsorSalarySlip?: boolean;
  docSponsorItr3Years?: boolean;
  docSponsorCompanyNoc?: boolean;
  docSponsorPersonalBankStatement?: boolean;
  docSponsorCompanyRegistration?: boolean;
  docSponsorFirmBankStatement?: boolean;
  // Applicant documents (for pure sponsored types)
  docApplicantBankStatement?: boolean;
  docApplicantItr?: boolean;
  docApplicantPanCard?: boolean;
  docApplicantAadhaar?: boolean;
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

// Schengen-like config reused for new individual countries
const schengenConfig: CountryScoreConfig = {
  maxScore: 95, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
  incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 18, above_17lac: 24 },
};

// Country-specific scoring configurations
export const countryConfigs: Record<string, CountryScoreConfig> = {
  'United States of America': {
    maxScore: 90, baseScore: 40, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 1, '5_to_10lac': 5, '10_to_17lac': 10, above_17lac: 15 },
  },
  'Canada': {
    maxScore: 95, baseScore: 45, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 1, '5_to_10lac': 5, '10_to_17lac': 10, above_17lac: 15 },
  },
  'United Kingdom': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 19, above_17lac: 24 },
  },
  'Australia': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 21, above_17lac: 24 },
  },
  'New Zealand': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 21, above_17lac: 24 },
  },
  'Japan': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 22, above_17lac: 24 },
  },
  'South Africa': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 22, above_17lac: 24 },
  },
  'South Korea': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 22, above_17lac: 24 },
  },
  'Brazil': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 22, above_17lac: 24 },
  },
  'Switzerland': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 22, above_17lac: 24 },
  },
  'France': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 22, above_17lac: 24 },
  },
  'Turkey': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 22, above_17lac: 24 },
  },
  'Ireland': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 22, above_17lac: 24 },
  },
  'Other European Countries': {
    maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
    incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 20, above_17lac: 24 },
  },
  // New Schengen individual countries — use schengen formula
  'Austria': { ...schengenConfig },
  'Belgium': { ...schengenConfig },
  'Bulgaria': { ...schengenConfig },
  'Croatia': { ...schengenConfig },
  'Cyprus': { ...schengenConfig },
  'Czech Republic': { ...schengenConfig },
  'Denmark': { ...schengenConfig },
  'Estonia': { ...schengenConfig },
  'Finland': { ...schengenConfig },
  'Germany': { ...schengenConfig },
  'Greece': { ...schengenConfig },
  'Hungary': { ...schengenConfig },
  'Iceland': { ...schengenConfig },
  'Italy': { ...schengenConfig },
  'Latvia': { ...schengenConfig },
  'Liechtenstein': { ...schengenConfig },
  'Lithuania': { ...schengenConfig },
  'Luxembourg': { ...schengenConfig },
  'Malta': { ...schengenConfig },
  'Netherlands': { ...schengenConfig },
  'Norway': { ...schengenConfig },
  'Poland': { ...schengenConfig },
  'Portugal': { ...schengenConfig },
  'Romania': { ...schengenConfig },
  'Slovakia': { ...schengenConfig },
  'Slovenia': { ...schengenConfig },
  'Spain': { ...schengenConfig },
  'Sweden': { ...schengenConfig },
};

const defaultConfig: CountryScoreConfig = {
  maxScore: 99, baseScore: 50, tier1Bonus: 20, tier2Bonus: 10, tier3Bonus: 5,
  incomeScores: { below_3lac: 0, '3_to_5lac': 5, '5_to_10lac': 10, '10_to_17lac': 20, above_17lac: 24 },
};

export const isSponsoredType = (type: string) =>
  type === 'sponsored_mother' || type === 'sponsored_father' || type === 'sponsored_husband';

export const isSalariedDocType = (type: string) =>
  type === 'salaried' || type === 'salaried_sponsored';

export function calculateVisaScore(
  input: VisaScoreInput,
  customConfigs?: Record<string, CountryScoreConfig>
): { score: number; category: 'Low' | 'Medium' | 'High' } {
  const configs = customConfigs || countryConfigs;
  const config = configs[input.country] || defaultConfig;
  
  let score = config.baseScore;
  
  // Travel history bonus
  if (input.travelHistoryTier1) {
    score += config.tier1Bonus;
  } else if (input.travelHistoryTier2) {
    score += config.tier2Bonus;
  } else if (input.travelHistoryTier3) {
    score += config.tier3Bonus;
  } else if (input.travelHistoryTier4) {
    score += config.tier3Bonus;
  }
  
  // Multi-country bonus: +2% per additional country in same tier
  const tierCounts = [
    input.tier1CountryCount || 0,
    input.tier2CountryCount || 0,
    input.tier3CountryCount || 0,
    input.tier4CountryCount || 0,
  ];
  for (const count of tierCounts) {
    if (count > 1) {
      score += (count - 1) * 2;
    }
  }
  
  // Income bonus - for sponsored types, use the higher of applicant/sponsor income
  if (isSponsoredType(input.employmentType) && input.sponsorYearlyIncome) {
    const applicantIncome = config.incomeScores[input.yearlyIncome] || 0;
    const sponsorIncome = config.incomeScores[input.sponsorYearlyIncome] || 0;
    score += Math.max(applicantIncome, sponsorIncome);
  } else {
    score += config.incomeScores[input.yearlyIncome] || 0;
  }
  
  // Document completeness bonus
  const salariedType = isSalariedDocType(input.employmentType);
  const sponsored = isSponsoredType(input.employmentType);
  
  let allDocsComplete: boolean;
  if (sponsored) {
    allDocsComplete = !!(
      input.docSponsorSalarySlip && input.docSponsorItr3Years && 
      input.docSponsorCompanyNoc && input.docSponsorPersonalBankStatement &&
      input.docSponsorCompanyRegistration && input.docSponsorFirmBankStatement
    );
  } else if (salariedType) {
    allDocsComplete = !!(input.docSalarySlip && input.docItr3Years && input.docCompanyNoc && input.docPersonalBankStatement);
  } else {
    allDocsComplete = !!(input.docCompanyRegistration && input.docBusinessItr3Years && input.docFirmBankStatement && input.docBusinessPersonalBankStatement);
  }
  
  if (allDocsComplete) {
    let tierBonus = 0;
    if (input.travelHistoryTier1) tierBonus += 2;
    if (input.travelHistoryTier2) tierBonus += 2;
    if (input.travelHistoryTier3) tierBonus += 2;
    score += tierBonus;
  }
  
  // Visa issued but not travelled penalty: -2% per country
  if (input.visaIssuedNotTravelledCountries && input.visaIssuedNotTravelledCountries.length > 0) {
    score -= input.visaIssuedNotTravelledCountries.length * 2;
  } else if (input.visaIssuedNotTravelledCountry) {
    score -= 2;
  }
  
  // Sponsored (mother/father/husband) penalty: -5%
  if (isSponsoredType(input.employmentType)) {
    score -= 5;
  }
  
  // Cap at country's max score and floor at 0
  score = Math.max(0, Math.min(score, config.maxScore));
  
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

// Country suggestions for low/medium scores
export function getCountrySuggestions(score: number, category: 'Low' | 'Medium' | 'High'): string[] {
  if (category === 'High') return [];
  
  const suggestions: string[] = [];
  if (score < 40) {
    suggestions.push('Thailand (Visa on Arrival)', 'Malaysia (eNTRI / eVisa)', 'Sri Lanka (ETA)', 'Vietnam (e-Visa)', 'Indonesia (Visa on Arrival)');
  } else if (score < 55) {
    suggestions.push('Turkey (e-Visa)', 'Azerbaijan (ASAN Visa)', 'Georgia (Visa Free)', 'Thailand (Visa on Arrival)', 'Malaysia (eNTRI)');
  } else if (score < 70) {
    suggestions.push('Italy', 'Spain', 'France', 'Turkey', 'South Korea', 'Japan', 'South Africa');
  }
  return suggestions;
}

export function getApprovalSuggestions(
  input: VisaScoreInput,
  score: number
): string[] {
  const suggestions: string[] = [];
  
  if (!input.travelHistoryTier1 && !input.travelHistoryTier2 && !input.travelHistoryTier3) {
    suggestions.push('Build travel history by visiting visa-free or e-visa countries first');
  } else if (!input.travelHistoryTier1 && input.travelHistoryTier3) {
    suggestions.push('Travel to major countries like US, UK, Canada, Australia, NZ to boost your score significantly');
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
  
  if (isSponsoredType(input.employmentType)) {
    suggestions.push('Sponsored applications have a 5% score deduction. Consider strengthening other factors like income and documents');
  }
  
  if (suggestions.length === 0) {
    suggestions.push('Maintain strong financial documentation and consistent travel patterns');
  }
  
  return suggestions.slice(0, 4);
}

// All destination countries for the frontend dropdown
export const popularCountries = [
  'United States of America',
  'Canada',
  'Australia',
  'United Kingdom',
  'New Zealand',
  'Austria',
  'Belgium',
  'Bulgaria',
  'Croatia',
  'Cyprus',
  'Czech Republic',
  'Denmark',
  'Estonia',
  'Finland',
  'Germany',
  'Greece',
  'Hungary',
  'Iceland',
  'Italy',
  'Latvia',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Netherlands',
  'Norway',
  'Poland',
  'Portugal',
  'Romania',
  'Slovakia',
  'Slovenia',
  'Spain',
  'Sweden',
  'Other European Countries',
  'Ireland',
  'Japan',
  'South Africa',
  'South Korea',
  'Brazil',
  'Switzerland',
  'France',
  'Turkey',
];

export const tier1Countries = [
  'Australia',
  'New Zealand',
  'United States',
  'Canada',
  'United Kingdom',
  'Other European Countries',
];

export const tier2Countries = [
  'Japan',
  'South Africa',
  'South Korea',
  'Brazil',
  'Georgia',
  'Switzerland',
  'France',
  'Austria',
  'Belgium',
  'Bulgaria',
  'Croatia',
  'Cyprus',
  'Czech Republic',
  'Denmark',
  'Estonia',
  'Finland',
  'Germany',
  'Greece',
  'Hungary',
  'Iceland',
  'Ireland',
  'Italy',
  'Latvia',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Netherlands',
  'Norway',
  'Poland',
  'Portugal',
  'Romania',
  'Slovakia',
  'Slovenia',
  'Spain',
  'Sweden',
  'Turkey',
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
  'Tanzania',
  'Ethiopia',
  'Sri Lanka',
  'Nepal',
  'Bangladesh',
  'Peru',
  'Mexico',
  'Zambia',
  'Mauritius',
  'Maldives',
  'Other African Countries',
  'Other Asian Countries',
];

// tier4 is no longer needed
export const tier4Countries: string[] = [];

export const allTravelCountries = [
  ...tier1Countries,
  ...tier2Countries,
  ...tier3Countries,
];

export const incomeRanges = [
  { value: 'below_3lac', label: 'Below ₹3 Lakhs' },
  { value: '3_to_5lac', label: '₹3 - 5 Lakhs' },
  { value: '5_to_10lac', label: '₹5 - 10 Lakhs' },
  { value: '10_to_17lac', label: '₹10 - 17 Lakhs' },
  { value: 'above_17lac', label: 'Above ₹17 Lakhs' },
];
