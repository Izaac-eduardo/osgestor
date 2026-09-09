# Importador de Ordens de Serviço Poli OS/Vega

Endpoints:

- `POST /importacoes-os/analisar`: recebe multipart `arquivo` (`.xls`/`.xlsx`) ou JSON `{ filename, contentBase64 }`; faz parsing, agrupa por `numero_os`, normaliza e gera a prévia sem gravar.
- `GET /importacoes-os/:token`: recupera uma prévia em memória.
- `PATCH /importacoes-os/:token/itens/:numeroOs`: resolve manualmente `obraId`, `frotaId`, `natureza`, `status`, `problema` e `prestadorTerceiro`.
- `POST /importacoes-os/:token/confirmar`: insere somente O.S. `PRONTA`, em transação individual, revalidando `numero_os`.

A classificação é conservadora: `RETIRAR MATERIAL...` vira MATERIAL; técnico IZAAC EDUARDO ou descrição contendo TERCEIRO vira TERCEIRO; status desconhecido, obra/frota ausentes ou modelos ambíguos ficam em revisão. Cliente nunca é usado como fallback de obra. Placas são buscadas antes de modelos. O parser preserva o número da O.S. e agrupa todas as linhas antes de qualquer persistência.

Produtos usam a tabela `produtos_os`, unidade `L` somente quando a descrição começa por óleo; `FILTRO DE OLEO` permanece `UN`. Serviços usam `servicos_os`. Execuções são associadas a `ordens_servico_funcionarios` apenas quando o funcionário tem correspondência única; horários e técnicos continuam na prévia para auditoria.

O export real `TESTE.XLS` é um relatório BIFF8 em blocos, não uma tabela: 47 O.S. (46565–46611), 20 abertas, 27 finalizadas, 13 com produtos, 23 com serviços, 27 execuções e 11 sem itens. O diagnóstico somente leitura está em `docs/diagnostico-teste-xls.json` e pode ser reproduzido com `npm run diagnose:os -- C:/Users/User/Downloads/TESTE.XLS`. Nenhuma O.S. foi inserida durante a análise. O teste `test/poli-os.test.ts` cobre o layout em blocos e as regras de classificação.
