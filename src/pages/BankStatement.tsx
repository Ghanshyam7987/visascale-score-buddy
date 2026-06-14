import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { BankStatementAnalyzer } from '@/components/bank/BankStatementAnalyzer';

const BankStatement = () => {
  return (
    <AppLayout>
      <Header title="Bank Statement Analyzer" showBack />
      <div className="p-4">
        <BankStatementAnalyzer />
      </div>
    </AppLayout>
  );
};

export default BankStatement;