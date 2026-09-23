import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorState } from "../components/ErrorState";
import { OrdersLoading } from "../components/orders/OrdersLoading";
import { PageHeader } from "../components/PageHeader";
import { AbastecimentosDrilldownModal } from "../components/abastecimentos/AbastecimentosDrilldownModal";
import { AbastecimentosExportMenu } from "../components/abastecimentos/AbastecimentosExportMenu";
import { getRelatorioAbastecimentos } from "../services/abastecimentos";
import { getProjects } from "../services/projects";
import type {
  AbastecimentoHistoricoFilters,
  AbastecimentosRelatorioResponse,
  DestinatarioTipo,
} from "../types/abastecimentos";
import type { Project } from "../types/projects";
import { formatCurrency, formatQuantity } from "../utils/formatters";

const products = [
  { value: "", label: "Todos" },
  { value: "DIESEL_S500", label: "S500" },
  { value: "DIESEL_S10", label: "S10" },
  { value: "ARLA_32", label: "ARLA 32" },
];
const types = [
  { value: "", label: "Todos" },
  { value: "FROTA", label: "Frota" },
  { value: "TERCEIRO", label: "Terceiro" },
  { value: "ESPECIAL", label: "Especial" },
  { value: "EXTERNA", label: "Externa" },
];
const productLabel = (value: string) =>
  value === "DIESEL_S500"
    ? "S500"
    : value === "DIESEL_S10"
      ? "S10"
      : value === "ARLA_32"
        ? "ARLA 32"
        : value;
const errorMessage = (error: unknown) =>
  axios.isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message ||
      "Não foi possível carregar os relatórios."
    : "Não foi possível carregar os relatórios.";

export function AbastecimentosRelatoriosPage() {
  const [filters, setFilters] = useState<ReportFilters>({
    data_inicio: "",
    data_fim: "",
    obra_id: "",
    produto: "",
    tipo_destinatario: "",
    busca: "",
    periodo: "dia",
  });
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(filters);
  const [projects, setProjects] = useState<Project[]>([]),
    [report, setReport] = useState<AbastecimentosRelatorioResponse | null>(
      null,
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const load = async (next = filters) => {
    setLoading(true);
    setError(null);
    try {
      const [data, obraData] = await Promise.all([
        getRelatorioAbastecimentos(toQuery(next)),
        projects.length ? Promise.resolve(projects) : getProjects(),
      ]);
      setReport(data);
      setProjects(obraData);
      setAppliedFilters(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const update = (key: keyof ReportFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const apply = (event: FormEvent) => {
    event.preventDefault();
    void load(filters);
  };
  const clear = () => {
    const next: ReportFilters = {
      data_inicio: "",
      data_fim: "",
      obra_id: "",
      produto: "",
      tipo_destinatario: "",
      busca: "",
      periodo: "dia",
    };
    setFilters(next);
    void load(next);
  };
  const openDrilldown = (next: DrilldownSelection) => {
    const entityFilter =
      next.kind === "Frota"
        ? { frota_id: next.id }
        : next.kind === "Obra"
          ? { obra_id: next.id }
          : { terceiro_id: next.id };
    setDrilldown({
      ...next,
      filters: { ...detailFilters(filters), ...entityFilter },
    });
  };

  return (
    <>
    <PageHeader
      title="Relatórios de Abastecimentos"
      subtitle="Analise consumo e gasto dos abastecimentos efetivamente confirmados."
      action={<AbastecimentosExportMenu kind="abastecimentos" filters={toQuery(appliedFilters)} />}
      />
      <div className="entrada-report-navigation">
        <Link to="/abastecimentos/relatorios/consumo-frota">
          Média de Consumo por Frota
        </Link>
        <Link to="/abastecimentos/relatorios/entradas">
          Relatório de Entradas
        </Link>
      </div>
      <form
        className="orders-filters abastecimento-filters relatorios-abastecimento-filters"
        onSubmit={apply}
      >
        <header>
          <h2>Filtros</h2>
          <p>Todos os indicadores e rankings respeitam os filtros aplicados.</p>
        </header>
        <div className="orders-filters__grid">
          <label>
            Data inicial
            <input
              type="date"
              value={filters.data_inicio}
              onChange={(e) => update("data_inicio", e.target.value)}
            />
          </label>
          <label>
            Data final
            <input
              type="date"
              value={filters.data_fim}
              onChange={(e) => update("data_fim", e.target.value)}
            />
          </label>
          <label>
            Obra
            <select
              value={filters.obra_id}
              onChange={(e) => update("obra_id", e.target.value)}
            >
              <option value="">Todas</option>
              {projects
                .filter((item) => item.status === "ATIVA")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Frota / destinatário
            <input
              value={filters.busca}
              placeholder="CE02C, CATARINA, PIRULITO..."
              onChange={(e) => update("busca", e.target.value)}
            />
          </label>
          <label>
            Produto
            <select
              value={filters.produto}
              onChange={(e) => update("produto", e.target.value)}
            >
              {products.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de destinatário
            <select
              value={filters.tipo_destinatario}
              onChange={(e) => update("tipo_destinatario", e.target.value)}
            >
              {types.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer>
          <button
            className="button button--secondary"
            type="button"
            onClick={clear}
          >
            Limpar filtros
          </button>
          <button className="button button--primary" type="submit">
            Aplicar filtros
          </button>
        </footer>
      </form>
      {loading && !report ? (
        <OrdersLoading />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        report && (
          <ReportContent
            report={report}
            periodo={filters.periodo}
            onPeriodoChange={(periodo) => {
              const next = { ...filters, periodo };
              setFilters(next);
              void load(next);
            }}
            onDrilldown={openDrilldown}
          />
        )
      )}
      {drilldown && (
        <AbastecimentosDrilldownModal
          kind={drilldown.kind}
          name={drilldown.name}
          meta={drilldown.meta}
          filters={drilldown.filters}
          onClose={() => setDrilldown(null)}
        />
      )}
    </>
  );
}

type ReportFilters = {
  data_inicio: string;
  data_fim: string;
  obra_id: string;
  produto: string;
  tipo_destinatario: "" | DestinatarioTipo;
  busca: string;
  periodo: "dia" | "mes";
};
type DrilldownKind = "Frota" | "Obra" | "Terceiro";
type DrilldownSelection = {
  kind: DrilldownKind;
  name: string;
  meta?: string;
  id: string;
};
type Drilldown = Omit<DrilldownSelection, "id"> & {
  filters: AbastecimentoHistoricoFilters;
};
const toQuery = (filters: ReportFilters): AbastecimentoHistoricoFilters => ({
  data_inicio: filters.data_inicio || undefined,
  data_fim: filters.data_fim || undefined,
  obra_id: filters.obra_id || undefined,
  produto: filters.produto || undefined,
  tipo_destinatario: filters.tipo_destinatario || undefined,
  busca: filters.busca || undefined,
  periodo: filters.periodo,
});
const detailFilters = (
  filters: ReportFilters,
): AbastecimentoHistoricoFilters => ({
  data_inicio: filters.data_inicio || undefined,
  data_fim: filters.data_fim || undefined,
  obra_id: filters.obra_id || undefined,
  produto: filters.produto || undefined,
  tipo_destinatario: filters.tipo_destinatario || undefined,
});

function ReportContent({
  report,
  periodo,
  onPeriodoChange,
  onDrilldown,
}: {
  report: AbastecimentosRelatorioResponse;
  periodo: "dia" | "mes";
  onPeriodoChange: (periodo: "dia" | "mes") => void;
  onDrilldown: (selection: DrilldownSelection) => void;
}) {
  return (
    <>
      <section className="relatorios-abastecimento-cards">
        <Card
          label="Total abastecido"
          value={`${formatQuantity(report.summary.litros)} L`}
        />
        <Card
          label="Valor total"
          value={formatCurrency(report.summary.valor)}
        />
        <Card
          label="Abastecimentos"
          value={String(report.summary.quantidade)}
        />
        <Card
          label="Destinatários distintos"
          value={String(report.summary.destinatarios)}
        />
      </section>
      <ProductDistribution
        products={report.por_produto}
        totalLitros={report.summary.litros}
      />
      <section className="relatorio-chart">
        <header className="relatorio-chart__header">
          <div>
            <h2>Evolução dos abastecimentos</h2>
            <p>
              Litros e valor por {periodo === "dia" ? "dia" : "mês"} no período
              filtrado.
            </p>
          </div>
          <div
            className="relatorio-period-toggle"
            role="group"
            aria-label="Granularidade da evolução"
          >
            <button
              className={periodo === "dia" ? "is-active" : ""}
              type="button"
              onClick={() => onPeriodoChange("dia")}
            >
              Diário
            </button>
            <button
              className={periodo === "mes" ? "is-active" : ""}
              type="button"
              onClick={() => onPeriodoChange("mes")}
            >
              Mensal
            </button>
          </div>
        </header>
        {report.evolucao.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={report.evolucao}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="data"
                tickFormatter={(value) => formatPeriod(String(value))}
              />
              <YAxis
                yAxisId="litros"
                label={{ value: "Litros", angle: -90, position: "insideLeft" }}
              />
              <YAxis
                yAxisId="valor"
                orientation="right"
                label={{
                  value: "Valor (R$)",
                  angle: 90,
                  position: "insideRight",
                }}
              />
              <Tooltip
                labelFormatter={(value) => formatPeriod(String(value))}
                formatter={(value, name) => [
                  name === "litros"
                    ? `${formatQuantity(Number(value))} L`
                    : formatCurrency(Number(value)),
                  name === "litros" ? "Litros" : "Valor (R$)",
                ]}
              />
              <Legend />
              <Line
                yAxisId="litros"
                type="monotone"
                dataKey="litros"
                name="Litros"
                stroke="#285877"
                strokeWidth={2}
              />
              <Line
                yAxisId="valor"
                type="monotone"
                dataKey="valor"
                name="Valor (R$)"
                stroke="#e28112"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyReport />
        )}
      </section>
      <div className="relatorios-abastecimento-grid">
        <RankedReportTable
          title="Consumo por obra"
          headers={[
            "Obra",
            "Abastecimentos",
            "Litros",
            "% dos litros",
            "Valor",
          ]}
          rows={report.por_obra.map((item) => [
            item.obra,
            item.quantidade,
            `${formatQuantity(item.litros)} L`,
            `${formatQuantity(item.percentual_litros)}%`,
            formatCurrency(item.valor),
          ])}
          onRowClick={(index) => {
            const item = report.por_obra[index];
            onDrilldown({ kind: "Obra", id: item.obra_id, name: item.obra });
          }}
        />
        <RankedReportTable
          title="Consumo por frota"
          headers={["Frota", "Placa", "Abastecimentos", "Litros", "Valor"]}
          rows={report.por_frota.map((item) => [
            item.frota,
            item.placa,
            item.quantidade,
            `${formatQuantity(item.litros)} L`,
            formatCurrency(item.valor),
          ])}
          onRowClick={(index) => {
            const item = report.por_frota[index];
            onDrilldown({
              kind: "Frota",
              id: item.frota_id,
              name: item.frota,
              meta: item.placa ? `Placa: ${item.placa}` : undefined,
            });
          }}
        />
        <ReportTable
          title="Consumo por terceiro"
          headers={["Terceiro", "Abastecimentos", "Litros", "Valor"]}
          rows={report.por_terceiro.map((item) => [
            item.terceiro,
            item.quantidade,
            `${formatQuantity(item.litros)} L`,
            formatCurrency(item.valor),
          ])}
          onRowClick={(index) => {
            const item = report.por_terceiro[index];
            onDrilldown({
              kind: "Terceiro",
              id: item.terceiro_id,
              name: item.terceiro,
            });
          }}
        />
        <ReportTable
          title="Destinações especiais"
          headers={["Destinação", "Abastecimentos", "Litros", "Valor"]}
          rows={report.especiais.map((item) => [
            item.destinacao,
            item.quantidade,
            `${formatQuantity(item.litros)} L`,
            formatCurrency(item.valor),
          ])}
        />
      </div>
    </>
  );
}

function ProductDistribution({
  products,
  totalLitros,
}: {
  products: AbastecimentosRelatorioResponse["por_produto"];
  totalLitros: number;
}) {
  return (
    <section className="relatorio-product-distribution">
      <header>
        <div>
          <h2>Distribuição por produto</h2>
          <p>Participação dos produtos nos litros abastecidos.</p>
        </div>
      </header>
      <div className="relatorio-product-list">
        {products.length ? (
          products.map((item) => {
            const percentage = totalLitros
              ? (item.litros / totalLitros) * 100
              : 0;
            return (
              <div className="relatorio-product-row" key={item.produto}>
                <div className="relatorio-product-row__labels">
                  <strong>{productLabel(item.produto)}</strong>
                  <span>
                    {formatQuantity(item.litros)} L ·{" "}
                    {formatQuantity(percentage)}%
                  </span>
                </div>
                <div className="relatorio-product-bar">
                  <span
                    style={{
                      width: `${Math.max(percentage, percentage > 0 ? 2 : 0)}%`,
                    }}
                  />
                </div>
                <small>
                  {item.quantidade} abastecimentos ·{" "}
                  {formatCurrency(item.valor)}
                </small>
              </div>
            );
          })
        ) : (
          <EmptyReport />
        )}
      </div>
    </section>
  );
}
function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="relatorios-abastecimento-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function RankedReportTable({
  title,
  headers,
  rows,
  onRowClick,
}: {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  onRowClick?: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, 10);
  return (
    <section className="relatorio-table-section">
      <header className="relatorio-table-section__header">
        <h2>{title}</h2>
        {rows.length > 10 && (
          <button
            className="link-button"
            type="button"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Recolher" : "Ver todos"}
          </button>
        )}
      </header>
      {visibleRows.length ? (
        <Table
          headers={headers}
          rows={visibleRows}
          title={title}
          onRowClick={onRowClick}
        />
      ) : (
        <EmptyReport />
      )}
    </section>
  );
}
function ReportTable({
  title,
  headers,
  rows,
  onRowClick,
}: {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  onRowClick?: (index: number) => void;
}) {
  return (
    <section className="relatorio-table-section">
      <header>
        <h2>{title}</h2>
      </header>
      {rows.length ? (
        <Table
          headers={headers}
          rows={rows}
          title={title}
          onRowClick={onRowClick}
        />
      ) : (
        <EmptyReport />
      )}
    </section>
  );
}
function Table({
  title,
  headers,
  rows,
  onRowClick,
}: {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  onRowClick?: (index: number) => void;
}) {
  return (
    <div className="orders-table-wrap">
      <table className="orders-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${title}-${index}`}
              className={onRowClick ? "relatorio-clickable-row" : undefined}
              onClick={() => onRowClick?.(index)}
              onKeyDown={(event) => {
                if (
                  onRowClick &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  onRowClick(index);
                }
              }}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {row.map((value, column) => (
                <td key={`${title}-${index}-${column}`}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function formatPeriod(value: string | number) {
  const [year, month, day] = String(value).split("-");
  return day ? `${day}/${month}` : `${month}/${year}`;
}
function EmptyReport() {
  return (
    <div className="relatorio-empty">
      Nenhum abastecimento encontrado no período.
    </div>
  );
}
