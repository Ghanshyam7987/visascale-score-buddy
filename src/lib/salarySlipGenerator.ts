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
}

export function generateSalarySlipPDF(data: SalarySlipData): void {
  const doc = new jsPDF();
  
  const companyName = data.companyName || 'Organization Name';
  const grossSalary = data.basicSalary + data.hra + data.da + data.otherAllowances;
  const totalDeductions = data.pf + data.tax + data.otherDeductions;
  const netSalary = grossSalary - totalDeductions;

  // Header
  doc.setFillColor(20, 128, 128);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName.toUpperCase(), 105, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('SALARY SLIP', 105, 32, { align: 'center' });

  // Reset text color
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

  // Earnings Section
  let yPos = 100;
  
  doc.setFillColor(20, 128, 128);
  doc.setTextColor(255, 255, 255);
  doc.rect(15, yPos - 7, 85, 10, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('EARNINGS', 20, yPos);
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  
  yPos += 12;
  doc.text('Basic Salary', 20, yPos);
  doc.text(`₹ ${data.basicSalary.toLocaleString('en-IN')}`, 80, yPos, { align: 'right' });
  
  yPos += 10;
  doc.text('House Rent Allowance (HRA)', 20, yPos);
  doc.text(`₹ ${data.hra.toLocaleString('en-IN')}`, 80, yPos, { align: 'right' });
  
  yPos += 10;
  doc.text('Dearness Allowance (DA)', 20, yPos);
  doc.text(`₹ ${data.da.toLocaleString('en-IN')}`, 80, yPos, { align: 'right' });
  
  yPos += 10;
  doc.text('Other Allowances', 20, yPos);
  doc.text(`₹ ${data.otherAllowances.toLocaleString('en-IN')}`, 80, yPos, { align: 'right' });
  
  yPos += 12;
  doc.setFont('helvetica', 'bold');
  doc.text('Gross Salary', 20, yPos);
  doc.text(`₹ ${grossSalary.toLocaleString('en-IN')}`, 80, yPos, { align: 'right' });

  // Deductions Section
  yPos = 100;
  
  doc.setFillColor(20, 128, 128);
  doc.setTextColor(255, 255, 255);
  doc.rect(110, yPos - 7, 85, 10, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DEDUCTIONS', 115, yPos);
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  
  yPos += 12;
  doc.text('Provident Fund (PF)', 115, yPos);
  doc.text(`₹ ${data.pf.toLocaleString('en-IN')}`, 180, yPos, { align: 'right' });
  
  yPos += 10;
  doc.text('Income Tax (TDS)', 115, yPos);
  doc.text(`₹ ${data.tax.toLocaleString('en-IN')}`, 180, yPos, { align: 'right' });
  
  yPos += 10;
  doc.text('Other Deductions', 115, yPos);
  doc.text(`₹ ${data.otherDeductions.toLocaleString('en-IN')}`, 180, yPos, { align: 'right' });
  
  yPos += 22;
  doc.setFont('helvetica', 'bold');
  doc.text('Total Deductions', 115, yPos);
  doc.text(`₹ ${totalDeductions.toLocaleString('en-IN')}`, 180, yPos, { align: 'right' });

  // Net Salary Box
  yPos = 175;
  doc.setFillColor(20, 128, 128);
  doc.rect(15, yPos, 180, 20, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('NET SALARY', 25, yPos + 13);
  doc.text(`₹ ${netSalary.toLocaleString('en-IN')}`, 185, yPos + 13, { align: 'right' });

  // Footer
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('This is a computer-generated document. No signature required.', 105, 220, { align: 'center' });
  doc.text(`Generated on ${new Date().toLocaleString('en-IN')}`, 105, 228, { align: 'center' });

  // Save PDF
  const fileName = `Salary_Slip_${data.employeeName.replace(/\s+/g, '_')}_${data.month}_${data.year}.pdf`;
  doc.save(fileName);
}
