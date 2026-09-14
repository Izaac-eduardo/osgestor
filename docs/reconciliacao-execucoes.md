# Reconciliação histórica de execuções

A ferramenta reutiliza o parser Poli OS atual e consolida execuções de um ou mais arquivos antes de comparar com o banco.

## Diagnóstico (somente leitura)

```text
npm.cmd run reconcile:execucoes -- <arquivo.xls> [outro.xlsx ...]
npm.cmd run reconcile:execucoes -- <pasta>
npm.cmd run reconcile:execucoes -- "<pasta>\*.XLS"
```

Sem `--apply`, nenhum dado é alterado no banco. O resultado detalhado é salvo em `docs/reconciliacao-execucoes-YYYYMMDDTHHmmssZ.json`.

## Aplicação

```text
npm.cmd run reconcile:execucoes -- <arquivo-ou-pasta> --apply
```

O modo `--apply` insere somente execuções ausentes, em uma transação por O.S. Associa uma execução ao único serviço disponível; quando a associação não é segura, grava `servico_os_id = NULL`. Nunca altera execuções existentes ou outros dados da O.S.
