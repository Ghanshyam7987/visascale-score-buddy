import jsPDF from 'jspdf';

export interface NocData {
  fatherName: string;
  motherName: string;
  applicantName: string;
  passportNumber: string;
  travelReason: string;
  country: string;
  date: string;
}

export function generateNocPDF(data: NocData): void {
  const doc = new jsPDF();
  let y = 30;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('NO OBJECTION CERTIFICATE (NOC)', 105, y, { align: 'center' });
  y += 15;

  // Date
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${data.date}`, 15, y);
  y += 15;

  // To
  doc.text('To,', 15, y);
  y += 6;
  doc.text('The Visa Officer,', 15, y);
  y += 6;
  doc.text(`Embassy / Consulate of ${data.country}`, 15, y);
  y += 12;

  // Subject
  doc.setFont('helvetica', 'bold');
  doc.text(`Subject: No Objection Certificate for ${data.applicantName}`, 15, y);
  y += 12;

  // Body
  doc.setFont('helvetica', 'normal');
  doc.text('Respected Sir/Madam,', 15, y);
  y += 10;

  const bodyText = `We, ${data.fatherName} (Father) and ${data.motherName} (Mother), parents of ${data.applicantName} (Passport No: ${data.passportNumber}), hereby declare that we have no objection to our son/daughter travelling to ${data.country}.`;
  const bodyLines = doc.splitTextToSize(bodyText, 180);
  doc.text(bodyLines, 15, y);
  y += bodyLines.length * 6 + 8;

  // Reason
  doc.setFont('helvetica', 'bold');
  doc.text('Purpose of Travel:', 15, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  const reasonLines = doc.splitTextToSize(data.travelReason, 180);
  doc.text(reasonLines, 15, y);
  y += reasonLines.length * 6 + 8;

  // Declaration
  const declaration = `We confirm that we fully support and sponsor this trip. We have no objection to the visa being granted to ${data.applicantName} for the purpose mentioned above. We assure that ${data.applicantName} will return to India after the completion of the trip.`;
  const declLines = doc.splitTextToSize(declaration, 180);
  doc.text(declLines, 15, y);
  y += declLines.length * 6 + 15;

  // Signatures
  doc.text('Thanking You,', 15, y);
  y += 10;
  doc.text('Yours sincerely,', 15, y);
  y += 15;

  // Father
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.fatherName}`, 15, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text('(Father)', 15, y);
  y += 6;
  doc.line(15, y, 80, y);
  doc.text('Signature', 15, y + 5);
  y += 15;

  // Mother
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.motherName}`, 15, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text('(Mother)', 15, y);
  y += 6;
  doc.line(15, y, 80, y);
  doc.text('Signature', 15, y + 5);

  // Save
  doc.save(`NOC_${data.applicantName.replace(/\s+/g, '_')}_${data.country}.pdf`);
}
