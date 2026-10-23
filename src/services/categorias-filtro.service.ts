import { pool } from '../config/database.js';
export const ordemServicoCategorias = [
  'LAVAGEM', 'MECANICA', 'AUTO_ELETRICA', 'ELETRICA', 'BORRACHARIA',
  'LUBRIFICACAO', 'SOLDAGEM', 'FUNILARIA', 'HIDRAULICA', 'OUTROS',
] as const;

export type CategoriaFiltroOrigem = 'OS' | 'GERENCIAL';
export interface CategoriaFiltro {
  origem: CategoriaFiltroOrigem;
  valor: string;
}
export interface CategoriaFiltroOpcao extends CategoriaFiltro {
  value: string;
  label: string;
}

export const parseCategoriaFiltro = (value: string | undefined): CategoriaFiltro | undefined => {
  if (!value) return undefined;
  const match = /^(OS|GERENCIAL):(.+)$/.exec(value);
  if (!match?.[2]?.trim()) throw new Error('categoria deve usar o formato OS:<categoria> ou GERENCIAL:<categoria>.');
  return { origem: match[1] as CategoriaFiltroOrigem, valor: match[2].trim() };
};

export const addCategoriaPredicate = (
  conditions: string[],
  values: Array<string | number>,
  alias: string,
  categoria: CategoriaFiltro | undefined,
): void => {
  if (!categoria) return;
  values.push(categoria.valor);
  const parameter = `$${values.length}`;
  if (categoria.origem === 'OS') conditions.push(`${alias}.categoria_servico = ${parameter}`);
  else conditions.push(`EXISTS (SELECT 1 FROM servicos_os categoria_servico_filtro WHERE categoria_servico_filtro.ordem_servico_id = ${alias}.id AND categoria_servico_filtro.categoria_gerencial = ${parameter})`);
};

export async function getCategoriasFiltro(): Promise<CategoriaFiltroOpcao[]> {
  const result = await pool.query<{ categoria: string }>(
    `SELECT DISTINCT categoria_gerencial categoria
       FROM servicos_os
      WHERE categoria_gerencial IS NOT NULL AND btrim(categoria_gerencial) <> ''
      ORDER BY categoria_gerencial`,
  );
  return [
    ...ordemServicoCategorias.map((valor) => ({ origem: 'OS' as const, valor, value: `OS:${valor}`, label: `${valor} (O.S.)` })),
    ...result.rows.map(({ categoria: valor }) => ({ origem: 'GERENCIAL' as const, valor, value: `GERENCIAL:${valor}`, label: `${valor} (serviços)` })),
  ];
}
