import type { Metadata } from 'next';
import CarteiraDashboardClient from './CarteiraDashboardClient';

export const metadata: Metadata = {
  title: 'Carteira - Credix',
  description: 'Liquidez, retorno e risco da carteira de empréstimos',
};

export default function CarteiraPage() {
  return <CarteiraDashboardClient />;
}
