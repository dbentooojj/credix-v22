# Múltiplas contas financeiras — validação e implantação futura

## Alterações

- `FinancialAccount` pertence a um usuário. O saldo é derivado de lançamentos, empréstimos efetivados e pagamentos; não há coluna mutável de saldo.
- A migração `20261112120000_multiple_financial_accounts` cria um `Caixa Original` por usuário, vincula os lançamentos, empréstimos e pagamentos existentes, e cria a mesma conta para novos usuários por trigger. Ela preserva os valores, datas e identificadores existentes.
- A migração complementar `20261112130000_payment_request_audit` mantém a chave de idempotência do recebimento no lançamento financeiro mesmo depois de um estorno.
- Transferências usam dois lançamentos atômicos, uma chave de idempotência e trava transacional por usuário. O dashboard e os relatórios financeiros excluem as duas pernas das métricas consolidadas.
- Recebimentos parciais podem ir a contas diferentes. O estorno preserva os lançamentos de caixa e cria lançamentos de reversão. Empréstimo efetivado só pode ser cancelado com confirmação de devolução do capital.
- A escrita antiga em massa de empréstimos e parcelas por `PUT /api/tables` retorna 409, pois não transporta a conta financeira e poderia regravar histórico. A leitura dessa rota continua disponível.

## Validação executada em desenvolvimento

Uma cópia do banco local foi restaurada em `credix_mfa_validation`, separada do banco local original. Antes e depois da migração, a consulta em [multiple-financial-accounts-validation.sql](multiple-financial-accounts-validation.sql) retornou os mesmos números: 2 usuários, 18 clientes, 48 empréstimos, 104 parcelas, 61 pagamentos, 136 lançamentos, principal de R$ 58.840,00 e pagamentos de R$ 41.592,00. As somas de entradas e saídas financeiras também permaneceram iguais. Nenhum lançamento ficou sem conta. O saldo consolidado das contas coincidiu com o KPI do dashboard para ambos os usuários da cópia.

O cálculo anterior do dashboard foi executado em uma segunda cópia sem as novas migrações, contra o cálculo novo na cópia migrada. Os 31 campos de KPI de cada um dos dois usuários coincidiram com tolerância de `0,000001` para arredondamento binário; caixa de R$ 0,00 e R$ 11.100,00, respectivamente. A maior diferença observada foi apenas de ponto flutuante na última casa, sem diferença em centavos.

O teste `backend/tests/financial-accounts.integration.ts` valida conta padrão, criação e edição, isolamento de usuários, transferências e estornos idempotentes, saldo insuficiente, concorrência, arquivamento com saldo, criação de empréstimo, pagamento parcial em conta diferente, estorno, indicadores, exportação CSV e criação automática de conta para novo usuário. Ele exige uma cópia isolada com o nome `credix_mfa_validation`.

## Implantação futura em produção

Este procedimento **não foi executado em produção**.

1. Agendar janela sem novas escritas financeiras. Registrar a versão do código e capturar as contagens, somas e indicadores atuais. Usar a consulta de validação acima para as contagens e somas.
2. Fazer backup lógico completo do PostgreSQL com `pg_dump -Fc -f credix-pre-mfa.dump`, usando credenciais do ambiente de produção e armazenamento seguro. Conferir com `pg_restore --list credix-pre-mfa.dump`. Fazer também um teste de restauração em banco separado.
3. Implantar o código desta branch. Executar `npm run prisma:generate --workspace backend` e `npm run prisma:migrate:deploy --workspace backend` uma única vez, então reiniciar o backend e frontend. Não executar `prisma migrate reset`.
4. Repetir contagens, somas e indicadores. Confirmar um `Caixa Original` por usuário, zero lançamentos sem conta e saldo consolidado igual ao dashboard. Testar criação de conta, transferência e pagamento em contas diferentes usando usuário de homologação antes de liberar escritas gerais.

## Recuperação

Em caso de divergência, interromper imediatamente novas escritas. Restaurar o dump validado **em um novo banco**, apontar a aplicação para essa base e voltar à versão anterior do código. Conferir contagens, somas e indicadores antes de reabrir o serviço. A restauração completa é necessária porque reverter apenas o esquema descartaria o vínculo entre contas e lançamentos feitos após a implantação. Preservar o banco com falha para auditoria.

## Riscos conhecidos

- O saldo histórico usa as mesmas regras consolidadas do dashboard para empréstimos e pagamentos. Bases com espelhos antigos inconsistentes precisam da comparação por usuário antes da implantação.
- `PUT /api/tables/loans` e `PUT /api/tables/installments` ficam indisponíveis para escrita; clientes externos que dependam dessas rotas precisam migrar para as APIs individuais.
- A migração foi exercitada em cópia representativa do banco local, não em cópia de produção. A validação específica de produção é etapa obrigatória da implantação futura.
