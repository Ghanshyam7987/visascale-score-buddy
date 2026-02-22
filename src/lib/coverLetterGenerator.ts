import jsPDF from 'jspdf';

export interface Applicant {
  name: string;
  passportNumber: string;
}

export interface CoverLetterData {
  date: string;
  country: string;
  addressType: 'embassy' | 'consulate';
  consularCity: string;
  applicants: Applicant[];
  dateOfArrival: string;
  dateOfDeparture: string;
  cities: { name: string; nights: number }[];
  documents: string[];
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

export const visaCountries = Object.keys(embassyAddresses);

export function generateCoverLetterPDF(data: CoverLetterData): void {
  const doc = new jsPDF();
  let y = 20;

  // Date
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${data.date}`, 15, y);
  y += 10;

  // To Address
  const addresses = embassyAddresses[data.country];
  const addressKey = data.consularCity;
  const address = addresses?.[addressKey] || '';

  doc.text('To,', 15, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`The Visa Officer,`, 15, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  const addressLines = address.split('\n');
  addressLines.forEach((line) => {
    doc.text(line, 15, y);
    y += 6;
  });

  y += 6;

  // Subject
  doc.setFont('helvetica', 'bold');
  doc.text(`Subject: Application for ${data.country} Tourist Visa`, 15, y);
  y += 10;

  // Body
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const applicantNames = data.applicants.map(a => a.name).join(', ');
  doc.text('Respected Sir/Madam,', 15, y);
  y += 8;

  const bodyText = `I/We, ${applicantNames}, would like to apply for a tourist visa to ${data.country}. The details of the trip are as follows:`;
  const bodyLines = doc.splitTextToSize(bodyText, 180);
  doc.text(bodyLines, 15, y);
  y += bodyLines.length * 6 + 4;

  // Applicant details table
  doc.setFont('helvetica', 'bold');
  doc.text('Applicant Details:', 15, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  data.applicants.forEach((applicant, i) => {
    doc.text(`${i + 1}. ${applicant.name} - Passport No: ${applicant.passportNumber}`, 20, y);
    y += 6;
  });
  y += 4;

  // Travel details
  doc.setFont('helvetica', 'bold');
  doc.text('Travel Details:', 15, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.text(`Date of Arrival: ${data.dateOfArrival}`, 20, y);
  y += 6;
  doc.text(`Date of Departure: ${data.dateOfDeparture}`, 20, y);
  y += 8;

  // Cities
  doc.setFont('helvetica', 'bold');
  doc.text('Itinerary:', 15, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  data.cities.forEach((city, i) => {
    doc.text(`${i + 1}. ${city.name} - ${city.nights} Night(s)`, 20, y);
    y += 6;
  });
  y += 4;

  // Documents
  if (data.documents.length > 0) {
    // Check if we need a new page
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.text('Documents Attached:', 15, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    data.documents.forEach((docName, i) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(`${i + 1}. ${docName}`, 20, y);
      y += 6;
    });
    y += 4;
  }

  // Check page overflow for closing
  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  // Closing
  doc.text('I/We kindly request you to grant the visa at the earliest convenience.', 15, y);
  y += 10;
  doc.text('Thanking You,', 15, y);
  y += 6;
  doc.text('Yours faithfully,', 15, y);
  y += 10;

  data.applicants.forEach((applicant) => {
    doc.setFont('helvetica', 'bold');
    doc.text(applicant.name, 15, y);
    y += 6;
  });

  // Save
  doc.save(`Cover_Letter_${data.country}_${data.date}.pdf`);
}
