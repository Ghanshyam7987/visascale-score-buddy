// VisaScore Calculation Logic
// Maximum score is capped at 99

export interface VisaScoreInput {
  country: string;
  purpose: 'tourist' | 'business' | 'student' | 'work';
  travelHistory: boolean;
  financialStrength: 'low' | 'medium' | 'high';
  employmentType: 'salaried' | 'self_employed' | 'business';
  bankBalanceRange: 'low' | 'medium' | 'high';
  hasSponsor: boolean;
}

export interface VisaScoreWeights {
  travel_history: number;
  financial_strength_high: number;
  financial_strength_medium: number;
  financial_strength_low: number;
  employment_salaried: number;
  employment_self_employed: number;
  employment_business: number;
  bank_balance_high: number;
  bank_balance_medium: number;
  bank_balance_low: number;
  has_sponsor: number;
  purpose_tourist: number;
  purpose_business: number;
  purpose_student: number;
  purpose_work: number;
}

export const defaultWeights: VisaScoreWeights = {
  travel_history: 20,
  financial_strength_high: 25,
  financial_strength_medium: 15,
  financial_strength_low: 5,
  employment_salaried: 15,
  employment_self_employed: 12,
  employment_business: 18,
  bank_balance_high: 15,
  bank_balance_medium: 10,
  bank_balance_low: 5,
  has_sponsor: 10,
  purpose_tourist: 5,
  purpose_business: 10,
  purpose_student: 8,
  purpose_work: 12,
};

export function calculateVisaScore(
  input: VisaScoreInput,
  weights: VisaScoreWeights = defaultWeights
): { score: number; category: 'Low' | 'Medium' | 'High' } {
  let score = 0;

  // Travel History
  if (input.travelHistory) {
    score += weights.travel_history;
  }

  // Financial Strength
  switch (input.financialStrength) {
    case 'high':
      score += weights.financial_strength_high;
      break;
    case 'medium':
      score += weights.financial_strength_medium;
      break;
    case 'low':
      score += weights.financial_strength_low;
      break;
  }

  // Employment Type
  switch (input.employmentType) {
    case 'salaried':
      score += weights.employment_salaried;
      break;
    case 'self_employed':
      score += weights.employment_self_employed;
      break;
    case 'business':
      score += weights.employment_business;
      break;
  }

  // Bank Balance Range
  switch (input.bankBalanceRange) {
    case 'high':
      score += weights.bank_balance_high;
      break;
    case 'medium':
      score += weights.bank_balance_medium;
      break;
    case 'low':
      score += weights.bank_balance_low;
      break;
  }

  // Sponsor/Invitation
  if (input.hasSponsor) {
    score += weights.has_sponsor;
  }

  // Purpose of Travel
  switch (input.purpose) {
    case 'tourist':
      score += weights.purpose_tourist;
      break;
    case 'business':
      score += weights.purpose_business;
      break;
    case 'student':
      score += weights.purpose_student;
      break;
    case 'work':
      score += weights.purpose_work;
      break;
  }

  // Cap at 99
  score = Math.min(score, 99);

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

  if (!input.travelHistory) {
    suggestions.push('Build travel history by visiting visa-free or e-visa countries first');
  }

  if (input.financialStrength !== 'high') {
    suggestions.push('Improve your financial documentation with higher bank balance and stable income proof');
  }

  if (input.bankBalanceRange !== 'high') {
    suggestions.push('Maintain higher bank balance for at least 6 months before applying');
  }

  if (!input.hasSponsor) {
    suggestions.push('Consider getting a sponsor or invitation letter from the destination country');
  }

  if (input.employmentType === 'self_employed') {
    suggestions.push('Provide strong business documentation including ITR, GST returns, and company registration');
  }

  if (score < 50) {
    suggestions.push('Consider applying to countries with easier visa requirements first');
    suggestions.push('Prepare comprehensive documentation including travel itinerary and hotel bookings');
  }

  if (suggestions.length === 0) {
    suggestions.push('Your profile looks strong! Ensure all documents are accurate and complete');
  }

  return suggestions.slice(0, 4); // Return max 4 suggestions
}

export const popularCountries = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Schengen (Europe)',
  'Japan',
  'Singapore',
  'UAE (Dubai)',
  'New Zealand',
  'South Korea',
];
