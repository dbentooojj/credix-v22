# Auditoria do frontend — 07/11/2026

Referência: commit `43c2a2206023e8317c949e5208bcd1a554db0cd2`.

> **Atualização após a auditoria:** os nove achados abaixo receberam correções locais. As seções seguintes registram o estado encontrado antes delas; o estado atual e os limites da correção estão descritos no fim do documento. As alterações ainda não foram publicadas.

## Escopo e resultado

Revisão de código, contratos com a API e verificações locais, com foco em Clientes, Empréstimos, Parcelas e componentes compartilhados. Foram identificados nove problemas acionáveis. A prioridade é impedir gravações baseadas em consultas malsucedidas; depois, corrigir cálculos, filtros e contratos dos formulários.

Não foram alterados código da aplicação, dados de negócio ou produção. Os testes de falha de gravação usaram `fetch` simulado, sem enviar PUT ao servidor. Os números abaixo são da base fictícia local, não de produção.

A inspeção visual não foi concluída: o controle do computador encerrou o acesso porque não conseguiu identificar a URL do Chrome com segurança. Responsividade real, navegação por teclado, leitor de tela e aparência em desktop/celular continuam pendentes. Esta auditoria não equivale a uma certificação de segurança, acessibilidade ou cobertura integral de todas as rotas.

## 1. P1 — Consulta malsucedida pode produzir substituição indevida de uma tabela

**Código:** `frontend/app/(dashboard)/app/clientes/ClientesClient.tsx:224` e `:250`; `frontend/app/(dashboard)/app/emprestimos/EmprestimosClient.tsx:1080`. Contrapartida: `backend/src/services/table-sync.service.ts:420` e `:550`.

Os handlers de salvar/excluir cliente e excluir empréstimo leem a tabela sem verificar `response.ok`. Uma resposta HTTP 500 com JSON sem `data` vira uma lista vazia. Em seguida, o frontend envia um PUT com essa lista, ou apenas com o novo cliente. O endpoint interpreta a lista como substituição dos registros do usuário, removendo os ausentes.

**Reprodução isolada:** executando os handlers extraídos do código com GET 500 simulado, foram capturados PUTs com respectivamente 1, 0 e 0 registros. Nenhuma dessas gravações foi enviada a um banco.

**Limite do impacto:** o backend bloqueia remoções de clientes com histórico e de empréstimos com parcelas pagas. Portanto, não é correto afirmar que qualquer falha apaga toda a base. Há risco nas coleções sem essas proteções e também de sobrescrever alterações concorrentes ao enviar uma fotografia antiga da tabela.

**Correção:** abortar diante de HTTP inválido ou estrutura inesperada; usar operações por registro, com controle de concorrência. Validar que GET 401/500 nunca dispara PUT e que alterações simultâneas não eliminam registros de outra operação.

## 2. P2 — Prévia de juros compostos e parcelas gravadas usam distribuições diferentes

**Código:** `frontend/utils/loanCalculator.ts:473`; `frontend/app/(dashboard)/app/emprestimos/EmprestimosClient.tsx:662`; `backend/src/routes/loan-simulations.routes.ts:751`.

A prévia calcula principal e juros de cada período sobre o saldo. Ao criar uma simulação, o frontend envia totais e vencimentos, mas não esse plano. Na aprovação, o backend distribui principal e juros igualmente pelas parcelas. A edição, por sua vez, envia o plano detalhado, criando mais uma diferença entre os fluxos.

**Teste isolado da calculadora real:** R$ 1.000,00, 10% ao mês, três parcelas, início em 07/11/2026 e primeiro vencimento em 07/12/2026. O total é R$ 1.220,74. A prévia distribui os juros em R$ 104,99, R$ 75,86 e R$ 39,89; o rateio da aprovação distribui R$ 73,58 por parcela. O principal também muda de distribuição. O total final pode continuar correto, mas a composição de cada recebimento diverge.

**Impacto:** inconsistência entre simulação e contrato persistido, relevante para informações de principal recuperado e lucro por pagamento. A aprovação não foi executada no banco durante a auditoria; sua distribuição foi conferida no código.

**Correção:** estabelecer um único cálculo autorizado no servidor e reutilizá-lo na prévia, criação e edição. Comparar cada parcela, inclusive principal, juros, vencimento e arredondamento, entre os três fluxos.

## 3. P2 — “Recebido no mês” filtra o vencimento, não o pagamento

**Código:** `frontend/app/(dashboard)/app/parcelas/ParcelasClient.tsx:302` e `:433`.

O cartão seleciona parcelas pagas cuja `dueDate` está no mês atual. Assim, um pagamento de dívida antiga recebido neste mês fica de fora, enquanto uma parcela vencendo neste mês e paga anteriormente pode entrar.

**Verificação com a base local em novembro/2026:** o cálculo atual retorna R$ 57.448,69 em 14 parcelas; considerando `payment_date`, são R$ 68.702,00 em 32 parcelas. Diferença: R$ 11.253,31. Foram utilizadas consultas de leitura e a lógica do componente.

**Correção:** usar a data efetiva do recebimento, com o mesmo critério de fuso dos relatórios. Para pagamentos parciais, preferir a soma dos registros de pagamentos. Validar recebimento atrasado, antecipado e na virada do mês.

## 4. P2 — Filtro “Quitado” não reconhece o status recebido da API

**Código:** `frontend/app/(dashboard)/app/emprestimos/EmprestimosClient.tsx:218` e `:1298`; `backend/src/services/table-sync.service.ts:131`.

A API transforma `QUITADO` em `Finalizado`. A normalização do frontend reconhece `quitado` e `paid`, mas mantém `Finalizado`. O filtro compara com `Quitado`, descartando esses empréstimos.

**Verificação:** a API local retornou 25 empréstimos com status `Finalizado`. O teste da função real confirmou que `Finalizado` permanece inalterado e não passa pelo filtro `Quitado`.

**Correção:** usar códigos canônicos entre camadas, separando o código do texto apresentado. Enquanto isso, reconhecer explicitamente o alias `Finalizado`. Validar a contagem do filtro contra a API.

## 5. P2 — Formulários oferecem entradas rejeitadas pelo contrato da API

**Código:** `frontend/app/(dashboard)/app/parcelas/ParcelasClient.tsx:733`; `backend/src/schemas/payments.schemas.ts:3`; `frontend/app/(dashboard)/app/clientes/ClientesClient.tsx:726`; `backend/src/services/table-sync.service.ts:349`.

O pagamento oferece `BOLETO` e `OUTRO`, mas o schema aceita apenas PIX, dinheiro, transferência e cartão. O campo de documento anuncia “CPF / CNPJ”, embora o backend aceite somente documentos de 11 dígitos.

**Verificação:** execução local de `createPaymentSchema.safeParse`: PIX aceito; BOLETO e OUTRO rejeitados. A rejeição de CNPJ está explícita na validação de quantidade de dígitos. Não foram criados pagamentos nem clientes para esse teste.

**Correção:** alinhar as opções disponíveis às capacidades implementadas ou implementar o suporte completo. Informar restrições no campo e validar antes do envio, mantendo a validação do servidor.

## 6. P2 — Falhas de leitura e sessão expirada podem aparecer como ausência de dados

**Código:** `frontend/app/(dashboard)/app/parcelas/ParcelasClient.tsx:160`; `frontend/app/(dashboard)/app/emprestimos/EmprestimosClient.tsx:498`; `frontend/app/(dashboard)/layout.tsx`.

Consultas convertem a resposta para JSON sem checar o status HTTP. HTTP 401/500 com JSON não entra automaticamente no `catch`. Em Parcelas, há também captura silenciosa de erros. Isso pode deixar a tela vazia ou manter valores anteriores, sem informar que a atualização falhou. O tratamento de sessão difere entre as páginas.

**Verificação HTTP local:** sem autenticação, as páginas de Clientes, Empréstimos e Parcelas retornaram o shell com HTTP 200, enquanto a API de parcelas retornou 401. Isso não demonstra vazamento: a proteção da API permaneceu ativa. O problema identificado é a experiência de erro e sessão.

**Correção:** centralizar requisições, tratar 401 com retorno ao login e apresentar estados distintos de carregamento, erro e lista vazia. Após uma mutação, diferenciar sucesso da gravação de falha ao atualizar a tela.

## 7. P2 — Contador de clientes inativos inclui clientes quitados

**Código:** `frontend/app/(dashboard)/app/clientes/ClientesClient.tsx:334` e `:394`.

O cartão “Clientes inativos” soma `Inativo` e `Quitado`. Quitar um empréstimo não equivale a desativar o cadastro. O filtro de inativos não usa essa mesma regra, agravando a inconsistência entre cartão e lista.

**Verificação local:** o contador resulta em 13, enquanto há 5 cadastros inativos; 8 clientes quitados são somados ao indicador.

**Correção:** separar status cadastral de situação financeira e definir o cartão pelo status cadastral. Testar um cliente ativo sem dívida e outro explicitamente inativado.

## 8. P2 — Tela de empréstimos pode manter situação vencida como pendente/em dia

**Código:** `frontend/app/(dashboard)/app/emprestimos/EmprestimosClient.tsx:1157` e `:1198`; `frontend/app/(dashboard)/app/parcelas/ParcelasClient.tsx:94`.

A lista de empréstimos usa o status persistido, e seus detalhes contam atrasos a partir do status da parcela. Já a tela Parcelas também compara o vencimento com a data atual. Uma parcela gravada como pendente e que vence posteriormente pode aparecer atrasada em uma tela e pendente na outra, sem uma atualização do registro.

**Evidência:** divergência de regras confirmada por leitura de código. Não foi simulado avanço do relógio em uma sessão visual. Os jobs encontrados não fornecem uma atualização diária geral que torne equivalentes esses cálculos.

**Correção:** compartilhar uma regra de situação efetiva baseada em vencimento, pagamento e data atual. Verificar o mesmo empréstimo nas duas telas antes e depois da virada do dia.

## 9. P2 — Modais e campos têm lacunas estruturais de acessibilidade

**Código:** `frontend/app/components/ModalBase.tsx:36`, `:54` e `:172`; modal específico em `frontend/app/(dashboard)/app/emprestimos/EmprestimosClient.tsx`.

O modal compartilhado declara `role="dialog"` e `aria-modal`, porém não associa o título ao diálogo. Não há gerenciamento de foco inicial, contenção do foco dentro do modal ou retorno ao acionador. O `panelRef` não implementa essas ações. O componente `ModalField` apresenta um `label` separado do campo, sem `htmlFor`/`id`. Há ainda modais próprios fora desse componente.

**Impacto:** navegação por teclado e identificação dos campos por leitor de tela ficam prejudicadas. As lacunas foram identificadas na estrutura do código; não houve teste com tecnologia assistiva nesta rodada.

**Correção:** consolidar os modais, associar título e campos, gerenciar foco e impedir interação com o fundo enquanto abertos. Validar Tab, Shift+Tab, Escape, retorno do foco e anúncio dos nomes dos controles.

## Observações e verificações pendentes

- **Contraste:** o tema claro preserva textos verdes claros e redefine textos secundários para tons claros. Revisar as combinações efetivamente renderizadas, sobretudo valores financeiros pequenos. Não foi realizada medição de contraste no navegador.
- **Escala:** as telas consultam tabelas completas e fazem paginação/associações no cliente. Considerar paginação e filtros no servidor à medida que a base crescer. Não houve teste de carga, portanto não foi quantificado um limite de desempenho.
- **Cobertura:** o pacote frontend não tem comandos próprios de testes ou lint. Acrescentar testes de comportamento para as regressões acima; compilação não valida filtros, regras financeiras nem falhas HTTP.
- **Validação visual:** ainda precisa cobrir celular estreito, desktop, zoom, tabelas, menu lateral, modais longos e mensagens de erro.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| TypeScript: `npx tsc -p frontend/tsconfig.json --noEmit --incremental false` no container local | Passou |
| GET 500 simulado nos handlers de salvar/excluir | Confirmou PUT indevido com lista incompleta/vazia |
| Status `Finalizado` na normalização e filtro | Confirmou incompatibilidade |
| Cartão mensal versus datas de pagamento da base local | Confirmou divergência |
| Métodos de pagamento contra schema real | Confirmou rejeição de Boleto e Outro |
| Calculadora de juros compostos versus rateio da aprovação | Confirmou distribuição diferente |
| Acesso HTTP local sem sessão | API retornou 401; páginas entregaram shell |
| Contador de inativos versus status cadastral | Confirmou inclusão de quitados |
| Inspeção visual e interação no navegador | Não concluída por bloqueio do controle do computador |

## Ordem sugerida de correção

1. Impedir PUT após leitura malsucedida e eliminar substituições de tabela nos fluxos por registro.
2. Unificar a composição financeira da simulação/aprovação e corrigir o cartão de recebimentos.
3. Corrigir status, filtros, contador de inativos e opções dos formulários.
4. Padronizar erros e sessão; corrigir acessibilidade e concluir a validação visual.

Este relatório registra achados e propostas. Não aplica correções nem autoriza um novo deploy.

## Atualização das correções locais

| Achado | Correção aplicada |
| --- | --- |
| 1. Gravação após GET malsucedido | Clientes e exclusão de empréstimos usam rotas por registro. O servidor verifica propriedade e histórico antes de excluir. |
| 2. Plano financeiro divergente | Novas simulações guardam o plano completo; aprovação e proposta usam seus valores de parcela, principal e juros. Um teste HTTP local confirmou igualdade com a prévia. |
| 3. Recebido no mês | O cartão soma registros de pagamento pela data efetiva, incluindo pagamentos sem parcela vinculada. |
| 4. Filtro Quitado | A interface reconhece `Finalizado` como quitado. |
| 5. Opções rejeitadas | Boleto e Outro foram retirados do formulário; o campo de documento indica CPF. |
| 6. Falhas de leitura | Clientes, Empréstimos e Parcelas verificam HTTP e estrutura da resposta; exibem erro e tentativa novamente. HTTP 401 redireciona ao login. |
| 7. Clientes inativos | O contador usa somente o status cadastral inativo. |
| 8. Atrasos divergentes | Empréstimos e Parcelas consideram vencimento e pagamento; atualizam a data de referência enquanto a tela fica aberta. |
| 9. Acessibilidade | Modais compartilhados e modais de empréstimo receberam nomes, gestão de foco, Escape e contenção de Tab; campos compartilhados associam rótulo ao controle. |

Uma migração acrescenta o campo opcional `plan` a `LoanSimulation`. Simulações antigas, que não têm esse plano salvo, mantêm o rateio anterior ao serem aprovadas. Para novas simulações, o servidor recalcula taxa, vencimentos, principal e juros e recusa prévias divergentes. As cópias do motor de cálculo em frontend e backend são verificadas por um teste de paridade; uma mudança nessa fórmula exige atualização das duas cópias.

Validação local: compilação TypeScript de backend/frontend, 34 testes automatizados do backend, build de produção do frontend com cache isolado, e fluxo HTTP de cliente → simulação → envio → aprovação → exclusão. O teste confirmou que o servidor recusa um plano financeiramente adulterado e que proposta e parcelas gravadas coincidem com a prévia. Os registros temporários foram removidos. A inspeção visual e com tecnologia assistiva permanece pendente por indisponibilidade do controle do navegador. Nenhuma publicação em produção foi feita nesta correção.
