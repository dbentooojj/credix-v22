import type { Metadata } from 'next';
import CarteiraDashboardClient from './CarteiraDashboardClient';

export const metadata: Metadata = {
  title: 'Painel da Carteira - Credix',
  description: 'Gerenciamento de carteira e fluxo financeiro',
};

export default function CarteiraPage() {
  return <CarteiraDashboardClient />;
}
