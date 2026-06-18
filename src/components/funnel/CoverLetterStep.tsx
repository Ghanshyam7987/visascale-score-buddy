import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileText, RefreshCw } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { VOResult, AccountType } from '@/lib/voMathEngine';
import { PrivacyNote } from './PrivacyNote';

interface Props {
  country: string;
  score: number;
  category: string;
  voResult: VOResult;
  accountType?: AccountType;
}

function buildDraft(opts: {
  applicantName: string;
  country: string;
  score: number;
  category: string;
  vo: VOResult;
  accountType: AccountType;
}) {
  const { applicantName, country, vo, accountType } = opts;
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const stmtLabel =
    accountType === 'sponsor' ? "sponsor's bank statement" :
    accountType === 'company' ? 'company / current account bank statement' :
    'bank statement';
  const justifications: string[] = [];

  for (const f of vo.flags) {
    if (f.level === 'red' && f.id === 'fund-parking') {
      justifications.push(
        `Regarding the large credit of ₹${Math.round(vo.largestDeposit.amount).toLocaleString('en-IN')} reflected in the ${stmtLabel}: this represents a genuine, traceable transaction (proceeds / maturity / family transfer) and is fully documented. It is not a borrowed sum parked temporarily for visa purposes, and the account history demonstrates consistent activity well before this credit.`,
      );
    }
    if (f.level === 'yellow' && f.id === 'no-economic-ties') {
      justifications.push(
        `In addition to my professional commitments in India, I maintain strong personal and financial ties to my home country including immediate family responsibilities, property and long-term obligations — all of which ensure my return after this short visit.`,
      );
    }
    if (f.level === 'yellow' && f.id === 'ghost-account') {
      justifications.push(
        `Please note that the submitted account is one of several accounts ${accountType === 'sponsor' ? 'my sponsor operates' : 'I operate'}. Day-to-day expenses are routed through other accounts; this ${stmtLabel} is provided primarily to evidence sufficient funds available for the trip.`,
      );
    }
    if (f.level === 'yellow' && f.id === 'affordability') {
      justifications.push(
        `My total trip cost is well within my financial capacity. In addition to the balance shown, I hold further liquid assets and fixed deposits which I can produce on request, and a portion of the trip cost is already pre-paid.`,
      );
    }
    if (f.level === 'yellow' && f.id === 'income-irregular') {
      justifications.push(
        `My income, while not always credited on a fixed date, is consistent over the year as supported by my ITR filings. I have attached supporting documentation to evidence the source and continuity of these earnings.`,
      );
    }
    if (f.level === 'yellow' && f.id === 'business-liquidity-weak') {
      justifications.push(
        `While the company / current account balance reflects working-capital deployment in business operations, sufficient personal liquidity and fixed deposits are available to fully fund this trip without disturbing business cashflow.`,
      );
    }
    if (f.level === 'yellow' && f.id === 'business-operations-weak') {
      justifications.push(
        `The submitted current account reflects only a portion of overall business activity. GST returns, invoices and additional operating accounts can be provided to evidence the active and genuine nature of the business.`,
      );
    }
  }

  const lines: string[] = [];
  lines.push(today);
  lines.push('');
  lines.push('The Visa Officer');
  lines.push(`Embassy / Consulate of ${country}`);
  lines.push('[Enter City Name Here]');
  lines.push('');
  lines.push(`Subject: Financial Justification Letter in support of my Tourist Visa application to ${country}`);
  lines.push('');
  lines.push('Respected Sir / Madam,');
  lines.push('');
  lines.push(
    `I, ${applicantName || '[Your Full Name]'}, am writing to formally request a short-stay tourist visa to ${country}. The purpose of my visit is purely leisure and tourism, and I intend to return to India well within the validity of my visa.`,
  );
  lines.push('');
  lines.push(
    `I have planned this trip carefully and have arranged my travel, accommodation and itinerary in advance. I have also organised the required funds to comfortably cover all expenses of this visit, as evidenced by the ${stmtLabel} enclosed with this application.`,
  );
  if (justifications.length) {
    lines.push('');
    lines.push('Clarifications regarding my financial documents:');
    for (const j of justifications) { lines.push(''); lines.push(j); }
  }
  lines.push('');
  lines.push(
    `I confirm that I will abide by all visa conditions and immigration regulations of ${country}. I kindly request you to consider my application favourably.`,
  );
  lines.push('');
  lines.push('Thank you for your time and consideration.');
  lines.push('');
  lines.push('Sincerely,');
  lines.push(applicantName || '[Your Full Name]');
  return lines.join('\n');
}

export function CoverLetterStep({ country, score, category, voResult, accountType = 'personal' }: Props) {
  const [applicantName, setApplicantName] = useState('');
  const initial = useMemo(
    () => buildDraft({ applicantName, country, score, category, vo: voResult, accountType }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [text, setText] = useState(initial);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setText(buildDraft({ applicantName, country, score, category, vo: voResult, accountType }));
    }
  }, [applicantName, country, score, category, voResult, dirty, accountType]);

  const handleDownload = async () => {
    const paragraphs = text.split('\n').map(line =>
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 120 },
        children: [new TextRun({ text: line || ' ', font: 'Calibri', size: 22 })],
      }),
    );
    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children: paragraphs,
      }],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Financial_Justification_Letter_${country.replace(/\s+/g, '_')}.docx`);
  };

  const regenerate = () => {
    setText(buildDraft({ applicantName, country, score, category, vo: voResult, accountType }));
    setDirty(false);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-bold text-sm">3</div>
        <div>
          <h2 className="text-xl font-bold leading-tight">Financial Justification Letter</h2>
          <p className="text-xs text-muted-foreground">Pre-drafted to defend any flags from Step 2. Edit freely.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="applicant-name" className="text-xs font-semibold">Your Full Name (as on passport)</Label>
            <Input
              id="applicant-name"
              value={applicantName}
              onChange={e => setApplicantName(e.target.value)}
              placeholder="e.g. Rohan Sharma"
            />
          </div>

          <div className="rounded-lg bg-white dark:bg-zinc-950 border shadow-sm p-6 md:p-10" style={{ aspectRatio: '210/297', maxWidth: '100%' }}>
            <Textarea
              value={text}
              onChange={e => { setText(e.target.value); setDirty(true); }}
              className="w-full h-full min-h-[60vh] border-0 focus-visible:ring-0 resize-none p-0 font-serif text-[13px] leading-relaxed bg-transparent"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleDownload}
              size="lg"
              className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-lg"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Financial Justification Letter
            </Button>
            <Button onClick={regenerate} variant="outline" size="lg">
              <RefreshCw className="mr-2 h-4 w-4" /> Reset Draft
            </Button>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>Generated as a clean .docx file you can edit further in MS Word, Google Docs or Pages.</span>
          </div>

          <PrivacyNote />
        </CardContent>
      </Card>
    </motion.section>
  );
}