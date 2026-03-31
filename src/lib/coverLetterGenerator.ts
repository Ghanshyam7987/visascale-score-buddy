import { Document, Packer, Paragraph, TextRun, AlignmentType, UnderlineType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } from 'docx';
import { saveAs } from 'file-saver';
import { allTravelCountries } from '@/lib/visaScoreCalculator';

export const relationOptions = [
  'Self', 'Wife', 'Husband', 'Son', 'Daughter',
  'Mother', 'Father', 'Sister', 'Brother',
  'Friend', 'Relative', 'Business Partner',
];

export const occupationOptions = [
  'BUSINESS', 'SERVICE', 'SELF EMPLOYED', 'HOMEMAKER',
  'STUDENT', 'RETIRED', 'NO OCCUPATION',
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
  expiryDate?: string;
  occupation?: string;
}

export interface TravelScheduleEntry {
  fromDate: string;
  toDate: string;
  country: string;
  modeOfTransport: string;
}

export interface CoverLetterData {
  date: string;
  country: string;
  consularCity: string;
  applicants: Applicant[];
  dateOfArrival: string;
  dateOfDeparture: string;
  cities: { name: string; nights: number }[];
  travelSchedule: TravelScheduleEntry[];
  documents: string[];
  designation?: string;
  businessName?: string;
  businessAddress?: string;
  phone?: string;
  email?: string;
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
    'Consulate - Mumbai': 'Consulate General of the Republic of Singapore,\nMaker Chamber IV, 9th Floor,\n222, Jamnalal Bajaj Marg,\nNariman Point, Mumbai - 400021',
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

function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function getConsularAddress(country: string, consularCity: string): string[] {
  const addresses = embassyAddresses[country];
  if (!addresses || !consularCity) return ['The Visa Officer', `Embassy of ${country}`, 'India'];
  const fullAddress = addresses[consularCity] || '';
  if (fullAddress) {
    return fullAddress.split(',\n').map(l => l.trim());
  }
  return ['The Visa Officer', `Embassy of ${country}`, 'India'];
}

function getRelationLabel(relation: string): string {
  if (!relation || relation === 'Self') return 'Self';
  return relation;
}

function getTitleForRelation(relation: string): string {
  const map: Record<string, string> = {
    'Wife': 'Mrs.', 'Husband': 'Mr.', 'Mother': 'Mrs.', 'Father': 'Mr.',
    'Son': 'Mr.', 'Daughter': 'Miss', 'Sister': 'Miss', 'Brother': 'Mr.',
    'Friend': 'Mr./Ms.', 'Relative': 'Mr./Ms.', 'Business Partner': 'Mr./Ms.',
  };
  return map[relation] || 'Mr.';
}

// Helper to create table cell
function makeCell(text: string, bold = false, fontSize = 18, width?: number): TableCell {
  const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
    margins: { top: 20, bottom: 20, left: 60, right: 60 },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text, font: 'Times New Roman', size: fontSize, bold })],
    })],
  });
}

export async function generateCoverLetterPDF(data: CoverLetterData): Promise<void> {
  const children: Paragraph[] = [];
  const fs = 18; // 9pt for single-page fit
  const font = 'Times New Roman';
  const sp = { before: 20, after: 20 };

  const run = (text: string, bold = false, underline = false) => new TextRun({
    text, font, size: fs, bold,
    underline: underline ? { type: UnderlineType.SINGLE } : undefined,
  });

  // Date - right aligned
  children.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 80 },
    children: [run(`Date: ${data.date}`, true)],
  }));

  // To + full consulate address
  children.push(new Paragraph({ spacing: sp, children: [run('To,')] }));
  children.push(new Paragraph({ spacing: sp, children: [run('The Visa Officer,')] }));

  const addressLines = getConsularAddress(data.country, data.consularCity);
  addressLines.forEach((line, i) => {
    children.push(new Paragraph({
      spacing: i === addressLines.length - 1 ? { ...sp, after: 100 } : sp,
      children: [run(line + (i < addressLines.length - 1 ? ',' : '.'), false, i === addressLines.length - 1)],
    }));
  });

  // Subject
  children.push(new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 2160 },
    children: [run('Subject: Issuance of Tourist Visa', true, true)],
  }));

  // Dear Sir/Madam
  children.push(new Paragraph({ spacing: { after: 60 }, children: [run('Dear Sir/Madam,')] }));

  // Main paragraph
  const primary = data.applicants[0];
  const title = primary.relation ? getTitleForRelation(primary.relation) : 'Mr.';
  const arrF = formatDateDDMMYYYY(data.dateOfArrival);
  const depF = formatDateDDMMYYYY(data.dateOfDeparture);
  const familyText = data.applicants.length > 1 ? ' along with my family' : '';

  let mainText = `I, the undersigned, `;
  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [
      run(mainText),
      run(`${title} ${primary.name}`, true),
      run(` holding Indian passport no `),
      run(primary.passportNumber, true),
      run(` like to travel ${data.country} from ${arrF} to ${depF}${familyText} for tourism purpose and to explore the beautiful cities of ${data.country}.`),
    ],
  }));

  // Traveler's details table
  children.push(new Paragraph({
    spacing: { before: 60, after: 40 },
    children: [run('Below are the traveler\'s details:', true, true)],
  }));

  // Table header
  const headerRow = new TableRow({
    children: [
      makeCell('Name', true, fs, 2400),
      makeCell('Passport Number', true, fs, 1800),
      makeCell('Expiry Date', true, fs, 1200),
      makeCell('Relation', true, fs, 1100),
      makeCell('Occupation', true, fs, 1800),
    ],
  });

  const dataRows = data.applicants.map((app) => {
    const rel = app.relation || 'Self';
    const appTitle = rel === 'Self' ? title : getTitleForRelation(rel);
    const expiry = app.expiryDate ? formatDateDDMMYYYY(app.expiryDate) : '';
    return new TableRow({
      children: [
        makeCell(`${appTitle} ${app.name}`, true, fs, 2400),
        makeCell(app.passportNumber, false, fs, 1800),
        makeCell(expiry, false, fs, 1200),
        makeCell(getRelationLabel(rel), false, fs, 1100),
        makeCell(app.occupation || '', false, fs, 1800),
      ],
    });
  });

  children.push(new Paragraph({ children: [] })); // spacer
  const travelersTable = new Table({
    width: { size: 8300, type: WidthType.DXA },
    columnWidths: [2400, 1800, 1200, 1100, 1800],
    rows: [headerRow, ...dataRows],
  });

  // Travel schedule table
  const hasSchedule = data.travelSchedule && data.travelSchedule.length > 0 && data.travelSchedule.some(s => s.country);

  // Business paragraph
  let bizText = '';
  if (data.designation && data.businessName) {
    const coApplicantWithRelation = data.applicants.find(a => a.relation === 'Wife' || a.relation === 'Husband');
    bizText = `I am ${data.designation} in "${data.businessName.toUpperCase()}"`;
    if (coApplicantWithRelation) {
      const spouseTitle = getTitleForRelation(coApplicantWithRelation.relation!);
      bizText += ` along with my ${(coApplicantWithRelation.relation || '').toLowerCase()} ${spouseTitle} ${coApplicantWithRelation.name}`;
    }
    bizText += '.';
  } else if (data.businessName) {
    bizText = `I am associated with "${data.businessName.toUpperCase()}".`;
  }

  // Build the document with tables mixed in
  const sectionChildren: (Paragraph | Table)[] = [...children];

  sectionChildren.push(travelersTable);

  // Travel schedule
  if (hasSchedule) {
    sectionChildren.push(new Paragraph({
      spacing: { before: 80, after: 40 },
      children: [run('Kindly find our travel schedule as below:', true, true)],
    }));

    const schedHeaderRow = new TableRow({
      children: [
        makeCell('Date', true, fs, 2800),
        makeCell('Country', true, fs, 2600),
        makeCell('Mode of Transport and Stay', true, fs, 2900),
      ],
    });

    const schedRows = data.travelSchedule.filter(s => s.country).map((entry) => {
      const from = formatDateDDMMYYYY(entry.fromDate);
      const to = formatDateDDMMYYYY(entry.toDate);
      return new TableRow({
        children: [
          makeCell(`${from} to ${to}`, false, fs, 2800),
          makeCell(entry.country, false, fs, 2600),
          makeCell(entry.modeOfTransport, false, fs, 2900),
        ],
      });
    });

    sectionChildren.push(new Table({
      width: { size: 8300, type: WidthType.DXA },
      columnWidths: [2800, 2600, 2900],
      rows: [schedHeaderRow, ...schedRows],
    }));
  }

  // Business line
  if (bizText) {
    sectionChildren.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [run(bizText)] }));
  }

  // Expenses
  sectionChildren.push(new Paragraph({
    spacing: { after: 40 },
    children: [run('All expenses of this trip will be borne by me.')],
  }));

  // Contact info line
  if (data.phone || data.email) {
    sectionChildren.push(new Paragraph({
      spacing: { after: 40 },
      children: [run('If you need any more information, kindly call or email me on below given details.', false, true)],
    }));
  }

  // Request
  sectionChildren.push(new Paragraph({
    spacing: { after: 40 },
    children: [run('I hereby request to your good office that kindly issue us visa and oblige.')],
  }));

  // Closing
  sectionChildren.push(new Paragraph({ spacing: { before: 60, after: 20 }, children: [run('Thanking you,')] }));
  sectionChildren.push(new Paragraph({ spacing: { after: 80 }, children: [run('Yours Faithfully,')] }));

  // Name
  sectionChildren.push(new Paragraph({ children: [run(primary.name, true)] }));

  // Contact details
  if (data.phone) {
    sectionChildren.push(new Paragraph({
      spacing: { before: 20 },
      children: [run('(M): ', true), run(`+91 ${data.phone}`)],
    }));
  }
  if (data.email) {
    sectionChildren.push(new Paragraph({
      children: [run('Email: ', true), run(data.email)],
    }));
  }

  const wordDoc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 900, bottom: 720, left: 900 },
        },
      },
      children: sectionChildren,
    }],
  });

  const blob = await Packer.toBlob(wordDoc);
  saveAs(blob, `Cover_Letter_${data.country}_${data.date.replace(/\//g, '-')}.docx`);
}
