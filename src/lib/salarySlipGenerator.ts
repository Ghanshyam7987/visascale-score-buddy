import jsPDF from 'jspdf';

export interface SalarySlipData {
  employeeName: string;
  designation: string;
  companyName?: string;
  month: string;
  year: string;
  basicSalary: number;
  hra: number;
  da: number;
  otherAllowances: number;
  pf: number;
  tax: number;
  otherDeductions: number;
  logoBase64?: string;
  signatureBase64?: string;
}

export function generateSalarySlipPDF(data: SalarySlipData): void {
  const doc = new jsPDF();
  
  const companyName = data.companyName || 'Organization Name';
  const grossSalary = data.basicSalary + data.hra + data.da + data.otherAllowances;
  const totalDeductions = data.pf + data.tax + data.otherDeductions;
  const netSalary = grossSalary - totalDeductions;

  // Header with optional logo
  doc.setFillColor(20, 128, 128);
  doc.rect(0, 0, 210, 40, 'F');
  
  if (data.logoBase64) {
    try {
      doc.addImage(data.logoBase64, 'PNG', 15, 5, 30, 30);
    } catch (e) {
      console.error('Error adding logo:', e);
    }
  }
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName.toUpperCase(), 105, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('SALARY SLIP', 105, 32, { align: 'center' });

  doc.setTextColor(0, 0, 0);

  // Employee Details Box
  doc.setFillColor(245, 245, 245);
  doc.rect(15, 50, 180, 35, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Employee Details', 20, 58);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Employee Name: ${data.employeeName}`, 20, 68);
  doc.text(`Designation: ${data.designation}`, 20, 76);
  doc.text(`Pay Period: ${data.month} ${data.year}`, 120, 68);
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 120, 76);

  // Earnings Section - only show non-zero fields
  let earningsY = 100;
  
  doc.setFillColor(20, 128, 128);
  doc.setTextColor(255, 255, 255);
  doc.rect(15, earningsY - 7, 85, 10, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('EARNINGS', 20, earningsY);
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  
  earningsY += 12;

  const earningsFields = [
    { label: 'Basic Salary', value: data.basicSalary },
    { label: 'House Rent Allowance (HRA)', value: data.hra },
    { label: 'Dearness Allowance (DA)', value: data.da },
    { label: 'Other Allowances', value: data.otherAllowances },
  ];

  earningsFields.forEach(field => {
    if (field.value > 0) {
      doc.text(field.label, 20, earningsY);
      doc.text(`₹ ${field.value.toLocaleString('en-IN')}`, 80, earningsY, { align: 'right' });
      earningsY += 10;
    }
  });

  earningsY += 2;
  doc.setFont('helvetica', 'bold');
  doc.text('Gross Salary', 20, earningsY);
  doc.text(`₹ ${grossSalary.toLocaleString('en-IN')}`, 80, earningsY, { align: 'right' });

  // Deductions Section - only show non-zero fields
  let deductionsY = 100;
  
  doc.setFillColor(20, 128, 128);
  doc.setTextColor(255, 255, 255);
  doc.rect(110, deductionsY - 7, 85, 10, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DEDUCTIONS', 115, deductionsY);
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  
  deductionsY += 12;

  const deductionFields = [
    { label: 'Provident Fund (PF)', value: data.pf },
    { label: 'Income Tax (TDS)', value: data.tax },
    { label: 'Other Deductions', value: data.otherDeductions },
  ];

  deductionFields.forEach(field => {
    if (field.value > 0) {
      doc.text(field.label, 115, deductionsY);
      doc.text(`₹ ${field.value.toLocaleString('en-IN')}`, 180, deductionsY, { align: 'right' });
      deductionsY += 10;
    }
  });

  deductionsY += 12;
  doc.setFont('helvetica', 'bold');
  doc.text('Total Deductions', 115, deductionsY);
  doc.text(`₹ ${totalDeductions.toLocaleString('en-IN')}`, 180, deductionsY, { align: 'right' });

  // Net Salary Box
  const netY = Math.max(earningsY, deductionsY) + 20;
  doc.setFillColor(20, 128, 128);
  doc.rect(15, netY, 180, 20, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('NET SALARY', 25, netY + 13);
  doc.text(`₹ ${netSalary.toLocaleString('en-IN')}`, 185, netY + 13, { align: 'right' });

  // Signature section
  const sigY = netY + 35;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  if (data.signatureBase64) {
    try {
      doc.addImage(data.signatureBase64, 'PNG', 140, sigY - 15, 40, 20);
      doc.line(135, sigY + 8, 185, sigY + 8);
      doc.text('Authorized Signatory', 160, sigY + 15, { align: 'center' });
    } catch (e) {
      console.error('Error adding signature:', e);
    }
  }

  // Footer
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('This is a computer-generated document. No signature required.', 105, 260, { align: 'center' });
  doc.text(`Generated on ${new Date().toLocaleString('en-IN')}`, 105, 268, { align: 'center' });

  const fileName = `Salary_Slip_${data.employeeName.replace(/\s+/g, '_')}_${data.month}_${data.year}.pdf`;
  doc.save(fileName);
}

export const essentialRequirements = [
  '📋 Keep your PAN card and Aadhaar ready for verification',
  '🏦 Bank statement for the last 6 months may be required',
  '📄 Employment letter from current employer',
  '💼 Form 16 or ITR for the relevant financial year',
  '📝 NOC from employer if required by visa authorities',
  '🔢 Salary account details matching with employer records',
];
