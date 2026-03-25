import jsPDF from 'jspdf';
import { allTravelCountries } from '@/lib/visaScoreCalculator';

export const relationOptions = [
  'My Mother', 'My Father', 'My Wife', 'My Husband',
  'My Son', 'My Daughter', 'My Sister', 'My Brother',
  'My Friend', 'My Relative', 'My Business Partner',
];

export const coverLetterDocuments = [
  'Original passports, completed Visa Application Forms, and two recent passport-size photographs',
  'Confirmed return flight reservations',
  'Hotel booking vouchers',
  'Detailed day-wise itinerary',
  'Personal covering letter',
  'Travel health insurance',
  'Bank statements for the last six months',
  'Income Tax Return acknowledgements (last 3 years)',
  'GST Certificate',
  'Company/Business Registration',
  'Salary Slips (last 3 months)',
  'Form 16',
  'PAN Card copy',
  'Aadhaar Card copy',
  'Property documents',
  'Sponsorship Letter / Affidavit',
  'Invitation Letter',
  'Sponsor\'s bank statements',
  'Proof of Relationship',
  'NOC from Employer',
];

export interface Applicant {
  name: string;
  passportNumber: string;
  relation?: string;
}

export interface CoverLetterData {
  date: string;
  country: string;
  consularCity: string;
  applicants: Applicant[];
  dateOfArrival: string;
  dateOfDeparture: string;
  cities: { name: string; nights: number }[];
  documents: string[];
  designation?: string;
  businessName?: string;
  businessAddress?: string;
}

export const embassyAddresses: Record<string, Record<string, string>> = {
  'USA': {
    'Embassy - New Delhi': 'Embassy of the United States of America,\nShantipath, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'U.S. Consulate General Mumbai,\nC-49, G-Block, Bandra Kurla Complex,\nBandra (E), Mumbai - 400051',
    'Consulate - Chennai': 'U.S. Consulate General Chennai,\n220 Anna Salai, Gemini Circle,\nChennai - 600006',
    'Consulate - Kolkata': 'U.S. Consulate General Kolkata,\n5/1 Ho Chi Minh Sarani,\nKolkata - 700071',
    'Consulate - Hyderabad': 'U.S. Consulate General Hyderabad,\nPaigah Palace, 1-8-323,\nChiran Fort Lane, Begumpet,\nHyderabad - 500003',
  },
  'UK': {
    'Embassy - New Delhi': 'British High Commission,\nShantipath, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'British Deputy High Commission,\nNaman Chambers, C/32, G Block,\nBandra Kurla Complex, Mumbai - 400051',
    'Consulate - Chennai': 'British Deputy High Commission,\n20, Anderson Road,\nChennai - 600006',
    'Consulate - Kolkata': 'British Deputy High Commission,\n1A Ho Chi Minh Sarani,\nKolkata - 700071',
    'Consulate - Hyderabad': 'British Deputy High Commission,\nAga Khan Bahadur Building,\nKing Koti Road, Hyderabad - 500001',
  },
  'Canada': {
    'Embassy - New Delhi': 'High Commission of Canada,\n7/8 Shantipath, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of Canada,\n21st Floor, Indiabulls Finance Centre,\nTower 2, Senapati Bapat Marg,\nElphinstone (W), Mumbai - 400013',
    'Consulate - Chennai': 'Consulate General of Canada,\nNo. 7, 4th Street, R.A. Puram,\nChennai - 600028',
    'Consulate - Kolkata': 'Consulate of Canada,\nDuncan House, 31 Netaji Subhas Road,\nKolkata - 700001',
    'Consulate - Hyderabad': 'Consulate of Canada,\nLevel 3, Uma Chambers,\nNagarjuna Hills, Punjagutta,\nHyderabad - 500082',
  },
  'Australia': {
    'Embassy - New Delhi': 'Australian High Commission,\n1/50G, Shantipath, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Australian Consulate General,\n36, Maker Chamber VI,\n220 Nariman Point, Mumbai - 400021',
    'Consulate - Chennai': 'Australian Consulate General,\nTemple Towers, 3rd Floor,\n476 Anna Salai, Nandanam,\nChennai - 600035',
    'Consulate - Kolkata': 'Australian Consulate,\nLok Nayak Jai Prakash Bhawan,\n1 Ashutosh Chowdhury Avenue,\nKolkata - 700019',
    'Consulate - Hyderabad': 'Australian Consulate,\nPlot No. 10, Kavuri Hills,\nMadhapur, Hyderabad - 500081',
  },
  'Germany': {
    'Embassy - New Delhi': 'Embassy of the Federal Republic of Germany,\nNo. 6/50G, Shantipath, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'German Consulate General,\n10th Floor, Hoechst House,\nNariman Point, Mumbai - 400021',
    'Consulate - Chennai': 'German Consulate General,\n9 Boat Club Road, R.A. Puram,\nChennai - 600028',
    'Consulate - Kolkata': 'German Consulate General,\n1 Hastings Park Road,\nAlipore, Kolkata - 700027',
    'Consulate - Hyderabad': 'German Consulate,\nRaheja Mindspace, IT Park,\nHitech City, Hyderabad - 500081',
  },
  'France': {
    'Embassy - New Delhi': 'Embassy of France in India,\n2/50-E, Shantipath, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of France,\nDatta Prasad, 10-N.S. Patkar Marg,\nMumbai - 400007',
    'Consulate - Chennai': 'Consulate General of France,\n24 Cathedral Road,\nChennai - 600086',
    'Consulate - Kolkata': 'Consulate General of France,\n26 Park Mansions, Park Street,\nKolkata - 700016',
    'Consulate - Hyderabad': 'Consulate of France,\nMiyapur, Hyderabad - 500049',
  },
  'Switzerland': {
    'Embassy - New Delhi': 'Embassy of Switzerland,\nNyaya Marg, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of Switzerland,\n102, Maker Chamber IV,\n222 Jamnalal Bajaj Road,\nNariman Point, Mumbai - 400021',
    'Consulate - Chennai': 'Honorary Consulate of Switzerland,\nNo. 1, R.K. Mutt Road,\nMylapore, Chennai - 600004',
    'Consulate - Kolkata': 'Honorary Consulate of Switzerland,\n18B Park Street,\nKolkata - 700016',
    'Consulate - Hyderabad': 'Honorary Consulate of Switzerland,\n6-3-1186, Begumpet,\nHyderabad - 500016',
  },
  'Italy': {
    'Embassy - New Delhi': 'Embassy of Italy,\n50-E, Chandragupta Marg, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of Italy,\nKanchanjunga Building, 72 Pedder Road,\nMumbai - 400026',
    'Consulate - Chennai': 'Honorary Consulate of Italy,\n14, Club House Road,\nChennai - 600002',
    'Consulate - Kolkata': 'Consulate General of Italy,\n3 Raja Santosh Road,\nAlipore, Kolkata - 700027',
    'Consulate - Hyderabad': 'Honorary Consulate of Italy,\nPanjagutta, Hyderabad - 500034',
  },
  'Japan': {
    'Embassy - New Delhi': 'Embassy of Japan,\n50-G, Shantipath, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of Japan,\nNo. 1, M.L. Dahanukar Marg,\nCumballa Hill, Mumbai - 400026',
    'Consulate - Chennai': 'Consulate General of Japan,\nNo. 12/1, Cenetoph Road,\nTeynampet, Chennai - 600018',
    'Consulate - Kolkata': 'Consulate General of Japan,\n55 M.N. Sen Lane, Tollygunge,\nKolkata - 700040',
    'Consulate - Hyderabad': 'Honorary Consulate of Japan,\n8-2-601/E/5, Road No. 10,\nBanjara Hills, Hyderabad - 500034',
  },
  'Singapore': {
    'Embassy - New Delhi': 'High Commission of the Republic of Singapore,\nE-6, Chandragupta Marg, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of Singapore,\nMaker Chamber IV, 9th Floor,\n222, Jamnalal Bajaj Marg,\nNariman Point, Mumbai - 400021',
    'Consulate - Chennai': 'Consulate General of Singapore,\nNo. 7, 5th Street, R.A. Puram,\nChennai - 600028',
    'Consulate - Kolkata': 'Honorary Consulate of Singapore,\n20B, Camac Street,\nKolkata - 700017',
    'Consulate - Hyderabad': 'Honorary Consulate of Singapore,\nPlot 12, Road No. 1,\nBanjara Hills, Hyderabad - 500034',
  },
  'Thailand': {
    'Embassy - New Delhi': 'Royal Thai Embassy,\n56-N, Nyaya Marg, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Royal Thai Consulate General,\nDalamal House, 1st Floor,\nNariman Point, Mumbai - 400021',
    'Consulate - Chennai': 'Royal Thai Consulate General,\n6, Cathedral Road,\nChennai - 600086',
    'Consulate - Kolkata': 'Royal Thai Consulate General,\n18B Mandeville Gardens,\nBallygunge, Kolkata - 700019',
    'Consulate - Hyderabad': 'Honorary Consulate of Thailand,\n8-2-120/86/6, Road No. 3,\nBanjara Hills, Hyderabad - 500034',
  },
  'Malaysia': {
    'Embassy - New Delhi': 'High Commission of Malaysia,\n50-M, Satya Marg, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of Malaysia,\nErnst & Young Building, 1st Floor,\nNariman Point, Mumbai - 400021',
    'Consulate - Chennai': 'Consulate General of Malaysia,\n32, Sterling Road, Nungambakkam,\nChennai - 600034',
    'Consulate - Kolkata': 'Honorary Consulate of Malaysia,\n25C, Park Street,\nKolkata - 700016',
    'Consulate - Hyderabad': 'Honorary Consulate of Malaysia,\nBanjara Hills, Hyderabad - 500034',
  },
  'New Zealand': {
    'Embassy - New Delhi': 'New Zealand High Commission,\nSir Edmund Hillary Marg,\nChanakyapuri, New Delhi - 110021',
    'Consulate - Mumbai': 'New Zealand Consulate General,\nMaker Chamber IV, 222 Jamnalal Bajaj Marg,\nNariman Point, Mumbai - 400021',
    'Consulate - Chennai': 'Honorary Consulate of New Zealand,\n132, Cathedral Road,\nChennai - 600086',
    'Consulate - Kolkata': 'Honorary Consulate of New Zealand,\n7 Middleton Row,\nKolkata - 700071',
    'Consulate - Hyderabad': 'Honorary Consulate of New Zealand,\nBegumpet, Hyderabad - 500003',
  },
  'Dubai (UAE)': {
    'Embassy - New Delhi': 'Embassy of the United Arab Emirates,\nEP-12, Chandragupta Marg, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of UAE,\nGold Crest, Opp. MMRDA Office,\nBandra Kurla Complex, Mumbai - 400051',
    'Consulate - Chennai': 'Consulate of UAE,\nKhivraj Complex, Anna Salai,\nChennai - 600002',
    'Consulate - Kolkata': 'Consulate of UAE,\nJ.L. Nehru Road,\nKolkata - 700013',
    'Consulate - Hyderabad': 'Consulate General of UAE,\nRoad No. 1, Banjara Hills,\nHyderabad - 500034',
  },
  'South Korea': {
    'Embassy - New Delhi': 'Embassy of the Republic of Korea,\n9, Chandragupta Marg, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of Republic of Korea,\nMaker Maxity, 2nd Floor,\nBandra Kurla Complex, Mumbai - 400051',
    'Consulate - Chennai': 'Consulate General of Republic of Korea,\n9, Cenotaph Road,\nTeynampet, Chennai - 600018',
    'Consulate - Kolkata': 'Honorary Consulate of Republic of Korea,\n4 Mangoe Lane,\nKolkata - 700001',
    'Consulate - Hyderabad': 'Honorary Consulate of Republic of Korea,\nBanjara Hills, Hyderabad - 500034',
  },
  'Vietnam': {
    'Embassy - New Delhi': 'Embassy of the Socialist Republic of Vietnam,\n17 Kautilya Marg, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of Vietnam,\nKalpak Estate, 4th Floor,\nMumbai - 400036',
    'Consulate - Chennai': 'Honorary Consulate of Vietnam,\nAnna Salai, Chennai - 600002',
    'Consulate - Kolkata': 'Honorary Consulate of Vietnam,\nPark Street, Kolkata - 700016',
    'Consulate - Hyderabad': 'Honorary Consulate of Vietnam,\nBanjara Hills, Hyderabad - 500034',
  },
  'Indonesia (Bali)': {
    'Embassy - New Delhi': 'Embassy of the Republic of Indonesia,\n50-A, Kautilya Marg, Chanakyapuri,\nNew Delhi - 110021',
    'Consulate - Mumbai': 'Consulate General of Indonesia,\n19 Altamount Road,\nMumbai - 400026',
    'Consulate - Chennai': 'Honorary Consulate of Indonesia,\n170, T.T.K. Road,\nChennai - 600018',
    'Consulate - Kolkata': 'Honorary Consulate of Indonesia,\n20A, Louden Street,\nKolkata - 700017',
    'Consulate - Hyderabad': 'Honorary Consulate of Indonesia,\nBanjara Hills, Hyderabad - 500034',
  },
};

const embassyCountryNames = Object.keys(embassyAddresses);
const allCoverLetterCountrySet = new Set([...embassyCountryNames, ...allTravelCountries]);
export const visaCountries = Array.from(allCoverLetterCountrySet).sort();

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = d.getDate();
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
  return `${day}${suffix} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getRelationTitle(relation: string, name: string): string {
  // Extract first name for title prefix
  const rel = relation.replace('My ', '').toLowerCase();
  const titleMap: Record<string, string> = {
    'mother': 'Mrs.',
    'father': 'Mr.',
    'wife': 'Mrs.',
    'husband': 'Mr.',
    'son': 'Mr.',
    'daughter': 'Miss',
    'sister': 'Miss',
    'brother': 'Mr.',
    'friend': '',
    'relative': '',
    'business partner': 'Mr./Ms.',
  };
  const title = titleMap[rel] || '';
  const relationLabel = relation.replace('My ', 'my ');
  return { title, relationLabel } as any;
}

function getApplicantLine(applicant: Applicant): string {
  const rel = (applicant.relation || '').replace('My ', '').toLowerCase();
  const titleMap: Record<string, string> = {
    'mother': 'Mrs.', 'father': 'Mr.', 'wife': 'Mrs.', 'husband': 'Mr.',
    'son': 'Mr.', 'daughter': 'Miss', 'sister': 'Miss', 'brother': 'Mr.',
    'friend': '', 'relative': '', 'business partner': '',
  };
  const title = titleMap[rel] || '';
  const relationLabel = (applicant.relation || '').replace('My ', 'my ');
  const titlePart = title ? `${title} ` : '';
  return ` ${relationLabel}, ${titlePart}${applicant.name} (Passport No. ${applicant.passportNumber})`;
}

function getCityFromConsularCity(consularCity: string): string {
  if (consularCity.includes('New Delhi')) return 'New Delhi';
  if (consularCity.includes('Mumbai')) return 'Mumbai';
  if (consularCity.includes('Chennai')) return 'Chennai';
  if (consularCity.includes('Kolkata')) return 'Kolkata';
  if (consularCity.includes('Hyderabad')) return 'Hyderabad';
  return 'New Delhi';
}

export function generateCoverLetterPDF(data: CoverLetterData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const usableWidth = pageWidth - margin * 2;
  let y = 20;

  const lineHeight = 6;

  const checkPage = (needed: number) => {
    if (y + needed > 275) {
      doc.addPage();
      y = 20;
    }
  };

  // Date - top left
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${data.date}`, margin, y);
  y += 14;

  // Address block
  doc.text('To,', margin, y);
  y += lineHeight;
  doc.text('The Visa Officer', margin, y);
  y += lineHeight;

  const city = getCityFromConsularCity(data.consularCity);
  doc.text(`Embassy of ${data.country}`, margin, y);
  y += lineHeight;
  doc.text(`${city}, India`, margin, y);
  y += 14;

  // Subject
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const subjectText = 'Application for Tourist Visa';
  doc.text(`Subject: ${subjectText}`, margin, y);
  const subjectStart = margin + doc.getTextWidth('Subject: ');
  const subjectWidth = doc.getTextWidth(subjectText);
  doc.line(subjectStart, y + 1, subjectStart + subjectWidth, y + 1);
  y += 12;

  // Dear Sir/Madam
  doc.setFont('helvetica', 'normal');
  doc.text('Dear Sir/Madam,', margin, y);
  y += 10;

  // Main paragraph
  const primary = data.applicants[0];
  let mainPara = `I, ${primary.name} (Passport No. ${primary.passportNumber}), wish to apply for a Tourist Visa to visit ${data.country} for tourism purposes.`;

  if (data.applicants.length > 1) {
    mainPara += ' I will be travelling along with my family members:';
  }

  const arrivalFormatted = formatDate(data.dateOfArrival);
  const departureFormatted = formatDate(data.dateOfDeparture);

  const mainLines = doc.splitTextToSize(mainPara, usableWidth);
  doc.text(mainLines, margin, y);
  y += mainLines.length * lineHeight + 4;

  // List co-applicants
  if (data.applicants.length > 1) {
    data.applicants.slice(1).forEach((applicant) => {
      checkPage(10);
      const line = getApplicantLine(applicant);
      const lines = doc.splitTextToSize(line, usableWidth - 5);
      // Draw bullet
      doc.setFont('helvetica', 'normal');
      doc.text('•', margin + 2, y);
      doc.text(lines, margin + 8, y);
      y += lines.length * lineHeight + 2;
    });
    y += 4;
  }

  // Travel dates
  if (arrivalFormatted && departureFormatted) {
    checkPage(14);
    const travelPara = `Our intended travel dates are from ${arrivalFormatted} to ${departureFormatted}.`;
    const travelLines = doc.splitTextToSize(travelPara, usableWidth);
    doc.text(travelLines, margin, y);
    y += travelLines.length * lineHeight + 6;
  }

  // Business / Employment paragraph
  checkPage(20);
  let bizPara = '';
  if (data.designation && data.businessName) {
    bizPara = `I am the ${data.designation} of ${data.businessName.toUpperCase()}`;
    if (data.businessAddress) {
      bizPara += `, ${data.businessAddress}`;
    }
    bizPara += ` and possess sufficient financial resources to cover all travel-related expenses.`;
  } else if (data.businessName) {
    bizPara = `I am associated with ${data.businessName.toUpperCase()} and possess sufficient financial resources to cover all travel-related expenses.`;
  } else {
    bizPara = `I possess sufficient financial resources to cover all travel-related expenses.`;
  }
  if (data.applicants.length > 1) {
    bizPara += ' I will be bearing the complete cost of the trip for all accompanying family members.';
  } else {
    bizPara += ' I will be bearing the complete cost of the trip.';
  }
  doc.setFont('helvetica', 'normal');
  const bizLines = doc.splitTextToSize(bizPara, usableWidth);
  doc.text(bizLines, margin, y);
  y += bizLines.length * lineHeight + 6;

  // Itinerary
  if (data.cities.length > 0 && data.cities.some(c => c.name)) {
    checkPage(20);
    const schengenCountries = ['Switzerland', 'Germany', 'France', 'Italy', 'Austria', 'Belgium', 'Netherlands', 'Spain', 'Portugal', 'Greece'];
    const isSchengen = schengenCountries.some(sc => data.country.includes(sc));
    const regionText = isSchengen ? 'the Schengen region' : data.country;
    doc.text(`Our planned itinerary within ${regionText} is as follows:`, margin, y);
    y += 10;

    data.cities.filter(c => c.name).forEach((city) => {
      checkPage(10);
      const padded = String(city.nights).padStart(2, '0');
      const cityLine = `${padded} Nights in ${city.name}`;
      doc.text('•', margin + 5, y);
      doc.text(cityLine, margin + 14, y);
      y += lineHeight + 2;
    });
    y += 4;
  }

  // Documents
  if (data.documents.length > 0) {
    checkPage(20);
    doc.text('Please find enclosed the following supporting documents for our visa application:', margin, y);
    y += 10;

    data.documents.forEach((docName) => {
      checkPage(10);
      doc.text('•', margin + 5, y);
      const docLines = doc.splitTextToSize(docName, usableWidth - 20);
      doc.text(docLines, margin + 14, y);
      y += docLines.length * lineHeight + 2;
    });
    y += 4;
  }

  // Closing
  checkPage(30);
  const closingText = 'I kindly request you to consider our application and grant us the necessary visa to undertake this trip.';
  const closingLines = doc.splitTextToSize(closingText, usableWidth);
  doc.text(closingLines, margin, y);
  y += closingLines.length * lineHeight + 14;

  // Sign off
  checkPage(30);
  doc.text('Yours faithfully,', margin, y);
  y += 20;

  // Applicant name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(primary.name, margin, y);

  doc.save(`Cover_Letter_${data.country}_${data.date.replace(/\//g, '-')}.pdf`);
}
