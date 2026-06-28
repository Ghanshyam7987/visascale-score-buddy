import * as XLSX from 'xlsx';
import { Applicant } from './types';

const STATUS_LABEL: Record<Applicant['status'], string> = {
  verified: 'Auto-Verified',
  review: 'Review Needed',
  failed: 'Extraction Failed',
};

export function exportApplicantsToExcel(rows: Applicant[]): void {
  const data = rows.map((r) => ({
    Status: STATUS_LABEL[r.status],
    Surname: r.surname,
    'Given Name': r.givenName,
    Gender: r.gender,
    'Date of Birth': r.dateOfBirth,
    'Date of Expiry': r.dateOfExpiry,
    Nationality: r.nationality,
    'Passport Number': r.passportNumber,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Applicants');
  const d = new Date();
  const stamp = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(wb, `Visa_Applicants_Export_${stamp}.xlsx`);
}