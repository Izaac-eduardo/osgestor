# Plano de sincronização do importador Poli OS — Fase A

## Escopo

Esta fase é somente diagnóstico e definição. Não foram criados endpoints de atualização, não houve alteração de frontend ou banco e nenhum dado real foi escrito, atualizado ou removido.

Não há XLS/XLSX Poli OS bruto no workspace. Há diagnósticos JSON históricos, mas eles não permitem reprocessar o arquivo original nem medir com segurança quantas O.S. mudaram entre snapshots.

## Fluxo atual

1. `parsePoliOs()` transforma o arquivo em `ParsedOs[]`, com número, data, problema, natureza, categoria, status, serviços, produtos e execuções.
2. `matchPreview()` resolve obra, frota e funcionários e calcula pendências.
3. O preview é persistido em `importacoes_os_itens.payload_json` por até 24 horas.
4. Durante `confirm()`, o controller executa `SELECT 1 FROM ordens_servico WHERE numero_os=$1`.
5. Se existir, a O.S. é classificada como `JA_CADASTRADA`/contabilizada em `jaCadastradas` e não é comparada nem alterada.
6. Se não existir, a inserção da O.S., serviços, produtos, vínculos e execuções ocorre na transação daquela O.S.

Nesse ponto, todos os dados do `ParsedOs` ainda estão disponíveis no payload do preview, mas o sistema atual não carrega o estado correspondente do banco para montar um diff.

Endpoints existentes: `POST /importacoes-os/analisar`, `GET /importacoes-os/:token`, `PATCH /importacoes-os/:token/itens/:numeroOs` e `POST /importacoes-os/:token/confirmar`. O PATCH atual serve para resolver pendências, não para atualizar O.S. existentes. Os endpoints de O.S. (`PUT /ordens-servico/:id`, serviços, produtos e execuções) também não devem ser compostos sem uma transação coordenadora.

## Identidade e estrutura atual

- `ordens_servico.numero_os` é `UNIQUE NOT NULL`; continua sendo a única identidade da O.S. Não deve ser criada uma segunda O.S. para uma atualização.
- `servicos_os`: `id`, `ordem_servico_id`, `descricao`, `valor`, timestamps. Não há código de origem, posição da linha ou fingerprint.
- `produtos_os`: `id`, `ordem_servico_id`, `descricao`, `quantidade`, `unidade`, `valor_unitario`, `valor_total` calculado, timestamps.
- `servicos_os_execucoes`: `ordem_servico_id`, `servico_os_id` opcional, `funcionario_id`, `inicio`, `fim`, timestamps. A migration 007 suporta execuções gerais com `servico_os_id = NULL`.
- `ordens_servico_funcionarios`: vínculo único por O.S. e funcionário.
- `importacoes_os_itens`: um payload JSON por `numero_os` dentro do token; não é histórico permanente.

## Política proposta

### Status

Usar uma progressão conservadora: `ABERTA → EM_ANDAMENTO → FINALIZADA` ou `ABERTA → CANCELADA`. Uma fonte antiga nunca pode rebaixar `FINALIZADA`, `CANCELADA` ou `EM_ANDAMENTO` automaticamente. `FINALIZADA ↔ CANCELADA` deve ser divergência para revisão, salvo regra futura com evidência de snapshot mais recente.

O update automático só deve aceitar avanço inequívoco. Status vazio/desconhecido não altera o banco. A data de fechamento só deve ser preenchida quando houver data válida no XLS; jamais deve ser apagada por valor vazio. O `ParsedOs` atual não possui campo explícito de fechamento, portanto a Fase B deve primeiro capturar essa informação, se existir no layout, antes de automatizar esse campo.

### Problema/observação

- banco vazio + XLS não vazio: candidato seguro para preenchimento;
- conteúdo normalizado igual: sem alteração;
- XLS vazio: nunca apagar conteúdo;
- conteúdo diferente: apresentar divergência, sem sobrescrever automaticamente.

Como não existe hoje uma origem/proveniência por campo, não é possível distinguir com segurança uma correção manual de um valor importado. Por isso, diferenças não triviais devem exigir confirmação explícita.

### Categoria

Aplicar as regras atuais do parser e comparar valores normalizados. `OUTROS → categoria específica` pode ser atualização segura quando o XLS produzir uma única categoria inequívoca. Categoria específica → `OUTROS` nunca deve regredir automaticamente. Categorias diferentes entre serviços devem continuar como `OUTROS`/revisão, sem escolha arbitrária.

### Natureza

Comparar a classificação atual com a classificação recalculada, mantendo a evidência e a confiança. A regra de serviço com técnico `IZAAC EDUARDO → TERCEIRO` e a regra de material finalizado sem serviço devem ser preservadas. Como a natureza pode ter sido corrigida manualmente e não há proveniência, divergências de natureza devem inicialmente ser mostradas como revisão; somente correções com evidência forte e sem regressão devem ser marcadas como atualização segura em uma fase posterior.

### Obra e frota

Nunca substituir automaticamente valores já preenchidos. A resolução do novo XLS pode ser comparada apenas para gerar uma divergência informativa. Isso protege correções manuais, inclusive quando a entrada continua usando `IPORA` em vez do cadastro `IPORÃ` ou quando o usuário escolheu uma frota diferente da sugestão automática.

## Itens e idempotência

### Serviços

O candidato lógico deve usar descrição normalizada + valor + ocorrência dentro da O.S. A ocorrência é necessária porque duas linhas com a mesma descrição podem ser legítimas. O `codigo` do `ParsedItem` é útil, mas atualmente não é persistido em `servicos_os`; portanto não pode ser a única chave sem uma mudança futura de modelo.

Comparação recomendada: formar multiconjuntos de fingerprints e parear ocorrências deterministically. Serviço já existente não é inserido; serviço adicional vira novo; mesma descrição com valor diferente vira `servicoAlterado` para revisão, não novo serviço automático.

### Produtos

Usar descrição normalizada + unidade normalizada + quantidade + valor unitário. Mesmo fingerprint não é duplicado; item adicional é novo; alteração de quantidade/valor é `produtoAlterado` para revisão. O total calculado serve como conferência, não como substituto dos campos-base.

### Execuções

A identidade proposta é `ordem_servico_id + funcionario_id + inicio + fim`, exatamente como o reconciliador já usa logicamente. Funcionário deve ser localizado por nome normalizado, sem criar duplicados. Execuções equivalentes não são inseridas; novas são adicionadas. Nunca apagar uma execução ausente de um XLS sem provar que o relatório é snapshot completo.

A associação serviço/execução precisa ser preservada no diff. Hoje, na confirmação, múltiplos serviços podem fazer a execução ser gravada como geral; a Fase B não deve alterar essa associação sem uma evidência inequívoca.

## XLS antigo versus XLS novo

O sistema possui `data` da O.S., horários das execuções, eventualmente status/data de fechamento no layout, além de `created_at` do preview e `arquivo_nome`. Isso não prova que um XLS é mais novo: `created_at` mede análise, não o momento do relatório.

Proposta: guardar metadados do snapshot no preview, comparar datas de fechamento/execução quando existirem e tratar ausência de evidência como não destrutiva. Um arquivo antigo pode no máximo gerar divergência; nunca deve reabrir, limpar ou substituir automaticamente dados mais fortes.

## Modelo de diff proposto

```ts
type OsUpdateDiff = {
  numeroOs: number;
  estado: 'NOVA' | 'ATUALIZACAO_DISPONIVEL' | 'SEM_ALTERACOES' | 'REQUER_REVISAO';
  status?: { atual: string; novo: string; segura: boolean };
  categoria?: { atual: string | null; nova: string | null; segura: boolean };
  natureza?: { atual: string; nova: string; segura: boolean };
  problema?: { atual: string | null; novo: string | null; revisao: boolean };
  novosServicos: ParsedItem[];
  servicosAlterados: Array<{ atual: unknown; novo: ParsedItem }>;
  novosProdutos: ParsedItem[];
  produtosAlterados: Array<{ atual: unknown; novo: ParsedItem }>;
  novasExecucoes: ParsedExecucao[];
  divergencias: string[];
  podeAtualizarAutomaticamente: boolean;
};
```

O preview deve contar `NOVAS`, `ATUALIZAÇÕES DISPONÍVEIS`, `SEM ALTERAÇÕES` e `REQUER REVISÃO`. O estado atual `JA_CADASTRADA` pode ser mantido por compatibilidade durante a transição, mas deve passar a representar `SEM_ALTERACOES` ou `ATUALIZACAO_DISPONIVEL` após o diff.

## Fluxo futuro da Fase B

1. Analisar o XLS e carregar a O.S. existente por `numero_os`.
2. Construir o diff sem escrever no banco.
3. Mostrar alterações e divergências no preview.
4. Permitir atualização individual; futuramente, “atualizar todas seguras”.
5. Abrir uma transação por O.S., aplicar apenas mudanças aprovadas, inserir somente itens/execuções ausentes e confirmar.
6. Em qualquer falha, rollback daquela O.S.; as demais podem continuar.

Para idempotência, o mesmo snapshot reaplicado deve produzir zero novos serviços, produtos e execuções. A sincronização deve ser aditiva: não executar DELETE por ausência no XLS.

## Auditoria e riscos

`updated_at` informa a última alteração, mas não informa o valor anterior, autor, origem ou motivo. O preview JSON é temporário. Para auditoria suficiente, a Fase B pode registrar no próprio resultado do preview e logs estruturados; futuramente seria útil um histórico permanente de sincronizações e decisões, sem criar isso nesta Fase A.

Riscos e prevenção:

- duplicação de serviços/produtos: fingerprints, multiconjuntos e transação;
- duplicação de execuções: chave lógica completa e funcionário normalizado;
- regressão de status: progressão monotônica e revisão de estados terminais;
- sobrescrita de obra/frota: nunca atualizar automaticamente valores existentes;
- perda de correção manual do problema: não sobrescrever diferenças nem vazios;
- natureza incorreta: exigir evidência forte/proveniência;
- XLS antigo: não fazer mudanças regressivas sem evidência de atualidade;
- O.S. parcialmente atualizada: uma transação independente por O.S.;
- associação errada de execução: preservar serviço de origem ou classificar para revisão.

## Testes necessários na Fase B

1. O.S. nova; 2. O.S. sem alterações; 3. `ABERTA → FINALIZADA`; 4. `ABERTA → CANCELADA`; 5. finalizada + XLS antigo aberta sem regressão; 6. serviço novo; 7. serviço existente sem duplicação; 8. dois serviços iguais legítimos; 9. serviço alterado; 10. produto novo; 11. produto existente sem duplicação; 12. produto alterado; 13. execução nova; 14. execução existente sem duplicação; 15. execução geral; 16. funcionário com acentos/caixa/espaços; 17. IZAAC EDUARDO sem execução interna; 18. obra manual preservada; 19. frota manual preservada; 20. `OUTROS → MECANICA`; 21. categoria específica não regredir para `OUTROS`; 22. `INTERNA → TERCEIRO` por evidência IZAAC; 23. mesmo XLS duas vezes; 24. falha em uma O.S. com rollback somente dela; 25. atualização em lote apenas das seguras.

## Conclusão

O caminho seguro é implementar primeiro um comparador somente-leitura e uma classificação detalhada do preview. A atualização deve ser posterior, explícita, transacional, aditiva e idempotente. Nesta Fase A nenhum comportamento executável foi alterado.
