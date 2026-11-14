import type { Metadata } from 'next';
import { FinancialStatementPanel } from '../../../components/FinancialAccountsPanel';
import { PageHeader } from '../../../components/PageHeader';

export const metadata: Metadata = {
  title: 'Extrato - Credix',
  description: 'Movimentações das contas financeiras',
};

export default function ExtratoPage() {
  return <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-24 lg:pb-8">
    <PageHeader title="Extrato" />
    <FinancialStatementPanel />
  </div>;
}
