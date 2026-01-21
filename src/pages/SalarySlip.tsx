import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { SalarySlipForm } from '@/components/salary/SalarySlipForm';

const SalarySlip = () => {
  return (
    <AppLayout>
      <Header title="Salary Slip Generator" showBack />
      <div className="p-4">
        <SalarySlipForm />
      </div>
    </AppLayout>
  );
};

export default SalarySlip;
