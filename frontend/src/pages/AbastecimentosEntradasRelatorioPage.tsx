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
import { AbastecimentosExportMenu } from "../components/abastecimentos/AbastecimentosExportMenu";
import {
  getAbastecimentoProdutos,
  getPontos,
  getRelatorioEntradas,
} from "../services/abastecimentos";
import type {
  AbastecimentoProduto,
  EntradasRelatorioFilters,
  EntradasRelatorioResponse,
  PontoOperacional,
} from "../types/abastecimentos";
import {
  formatCurrency,
  formatDate,
  formatQuantity,
} from "../utils/formatters";

type Filters = {
  data_inicio: string;
  data_fim: string;
  produto_id: string;
  numero_nf: string;
  ponto_id: string;
  periodo: "dia" | "mes";
  page: number;
};
const initialFilters: Filters = {
  data_inicio: "",
  data_fim: "",
  produto_id: "",
  numero_nf: "",
  ponto_id: "",
  periodo: "dia",
  page: 1,
};
const errorMessage = (error: unknown) =>
  axios.isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message ||
      "Não foi possível carregar o relatório de entradas."
    : "Não foi possível carregar o relatório de entradas.";

export function AbastecimentosEntradasRelatorioPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [products, setProducts] = useState<AbastecimentoProduto[]>([]);
  const [points, setPoints] = useState<PontoOperacional[]>([]);
  const [report, setReport] = useState<EntradasRelatorioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async (next = filters) => {
    setLoading(true);
    setError(null);
    try {
      const [data, productData, pointData] = await Promise.all([
        getRelatorioEntradas(toQuery(next)),
        products.length
          ? Promise.resolve(products)
          : getAbastecimentoProdutos(),
        points.length ? Promise.resolve(points) : getPontos(),
      ]);
      setReport(data);
      setProducts(productData);
      setPoints(pointData);
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
  const update = (key: keyof Filters, value: string) =>
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "periodo" ? { page: 1 } : {}),
    }));
  const apply = (event: FormEvent) => {
    event.preventDefault();
    void load({ ...filters, page: 1 });
  };
  const clear = () => {
    setFilters(initialFilters);
    void load(initialFilters);
  };
  const changePage = (page: number) => {
    const next = { ...filters, page };
    setFilters(next);
    void load(next);
  };
  return (
    <>
    <PageHeader
      title="Relatório de Entradas"
      subtitle="Visão gerencial de compras e recebimentos de combustível e ARLA."
      action={<AbastecimentosExportMenu kind="entradas" filters={toExportQuery(appliedFilters)} />}
      />
      <div className="entrada-report-navigation">
        <Link to="/abastecimentos/relatorios">
          ← Voltar para Relatório de Abastecimentos
        </Link>
        <Link to="/abastecimentos/entradas">
          Abrir tela operacional de Entradas
        </Link>
      </div>
      <form className="orders-filters abastecimento-filters" onSubmit={apply}>
        <header>
          <h2>Filtros</h2>
          <p>Todos os indicadores representam o conjunto completo filtrado.</p>
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
            Produto
            <select
              value={filters.produto_id}
              onChange={(e) => update("produto_id", e.target.value)}
            >
              <option value="">Todos</option>
              {products
                .filter((item) => item.permite_entrada)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Número da NF
            <input
              value={filters.numero_nf}
              onChange={(e) => update("numero_nf", e.target.value)}
            />
          </label>
          <label>
            Ponto de recebimento
            <select
              value={filters.ponto_id}
              onChange={(e) => update("ponto_id", e.target.value)}
            >
              <option value="">Todos</option>
              {points
                .filter((item) => item.status === "ATIVO")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.codigo} — {item.nome}
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
              const next = { ...filters, periodo, page: 1 };
              setFilters(next);
              void load(next);
            }}
            onPage={changePage}
          />
        )
      )}
    </>
  );
}

const toQuery = (filters: Filters): EntradasRelatorioFilters => ({
  data_inicio: filters.data_inicio || undefined,
  data_fim: filters.data_fim || undefined,
  produto_id: filters.produto_id || undefined,
  numero_nf: filters.numero_nf || undefined,
  ponto_id: filters.ponto_id || undefined,
  periodo: filters.periodo,
  page: filters.page,
  limit: 25,
});
const toExportQuery = (filters: Filters): Omit<EntradasRelatorioFilters, "page" | "limit"> => ({
  data_inicio: filters.data_inicio || undefined,
  data_fim: filters.data_fim || undefined,
  produto_id: filters.produto_id || undefined,
  numero_nf: filters.numero_nf || undefined,
  ponto_id: filters.ponto_id || undefined,
  periodo: filters.periodo,
});
function ReportContent({
  report,
  periodo,
  onPeriodoChange,
  onPage,
}: {
  report: EntradasRelatorioResponse;
  periodo: "dia" | "mes";
  onPeriodoChange: (periodo: "dia" | "mes") => void;
  onPage: (page: number) => void;
}) {
  return (
    <>
      <section className="relatorios-abastecimento-cards entrada-report-cards">
        <Card label="Entradas" value={String(report.summary.entradas)} />
        <Card
          label="Litros NF"
          value={`${formatQuantity(report.summary.litros_nf)} L`}
        />
        <Card
          label="Valor NF"
          value={formatCurrency(report.summary.valor_nf)}
        />
      </section>
      <section className="entrada-report-grid">
        <section className="relatorio-table-section">
          <header>
            <h2>Distribuição por produto</h2>
          </header>
          {report.por_produto.length ? (
            <div className="orders-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Entradas</th>
                    <th>Litros NF</th>
                    <th>% litros</th>
                    <th>Valor NF</th>
                    <th>% valor</th>
                  </tr>
                </thead>
                <tbody>
                  {report.por_produto.map((item) => (
                    <tr key={item.produto_id}>
                      <td>{item.nome}</td>
                      <td>{item.quantidade}</td>
                      <td>{formatQuantity(item.litros_nf)} L</td>
                      <td>{formatQuantity(item.percentual_litros)}%</td>
                      <td>{formatCurrency(item.valor_nf)}</td>
                      <td>{formatQuantity(item.percentual_valor)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyReport />
          )}
        </section>
        <section className="relatorio-table-section">
          <header>
            <h2>Recebimento por ponto</h2>
          </header>
          {report.por_ponto.length ? (
            <div className="orders-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Ponto</th>
                    <th>Entradas</th>
                    <th>Litros recebidos</th>
                  </tr>
                </thead>
                <tbody>
                  {report.por_ponto.map((item) => (
                    <tr key={item.ponto_id}>
                      <td>
                        <strong>{item.codigo}</strong>
                        <small className="entrada-report-muted">
                          {item.nome}
                        </small>
                      </td>
                      <td>{item.entradas}</td>
                      <td>{formatQuantity(item.litros)} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyReport message="Nenhum ponto recebeu litros no período filtrado." />
          )}
        </section>
      </section>
      <section className="relatorio-chart">
        <header className="relatorio-chart__header">
          <div>
            <h2>Evolução das entradas</h2>
            <p>Litros NF e valor NF por {periodo === "dia" ? "dia" : "mês"}.</p>
          </div>
          <div
            className="relatorio-period-toggle"
            role="group"
            aria-label="Granularidade da evolução"
          >
            <button
              type="button"
              className={periodo === "dia" ? "is-active" : ""}
              onClick={() => onPeriodoChange("dia")}
            >
              Diário
            </button>
            <button
              type="button"
              className={periodo === "mes" ? "is-active" : ""}
              onClick={() => onPeriodoChange("mes")}
            >
              Mensal
            </button>
          </div>
        </header>
        {report.evolucao.length ? (
          <div className="entrada-report-chart">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={report.evolucao}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" tickFormatter={formatPeriod} />
                <YAxis
                  yAxisId="litros"
                  label={{
                    value: "Litros NF",
                    angle: -90,
                    position: "insideLeft",
                  }}
                />
                <YAxis
                  yAxisId="valor"
                  orientation="right"
                  label={{
                    value: "Valor NF (R$)",
                    angle: 90,
                    position: "insideRight",
                  }}
                />
                <Tooltip
                  labelFormatter={(value) => formatPeriod(String(value))}
                  formatter={(value, name) => [
                    name === "litros_nf"
                      ? `${formatQuantity(Number(value))} L`
                      : formatCurrency(Number(value)),
                    name === "litros_nf" ? "Litros NF" : "Valor NF",
                  ]}
                />
                <Legend />
                <Line
                  yAxisId="litros"
                  type="monotone"
                  dataKey="litros_nf"
                  name="Litros NF"
                  stroke="#285877"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="valor"
                  type="monotone"
                  dataKey="valor_nf"
                  name="Valor NF"
                  stroke="#e28112"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyReport />
        )}
      </section>
      <EntradaTable report={report} onPage={onPage} />
    </>
  );
}
function EntradaTable({
  report,
  onPage,
}: {
  report: EntradasRelatorioResponse;
  onPage: (page: number) => void;
}) {
  return (
    <section className="relatorio-table-section">
      <header>
        <h2>Entradas detalhadas</h2>
        <p>{report.pagination.total} registro(s) no conjunto filtrado</p>
      </header>
      {report.items.length ? (
        <>
          <div className="orders-table-wrap entrada-report-table">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>NF</th>
                  <th>Produto</th>
                  <th>Litros NF</th>
                  <th>Valor NF</th>
                  <th>Total distribuído</th>
                  <th>Destinos</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.data_entrada)}</td>
                    <td>
                      <strong>{item.numero_nf}</strong>
                    </td>
                    <td>{item.produto_nome}</td>
                    <td>{formatQuantity(item.litros_nf)} L</td>
                    <td>{formatCurrency(item.valor_total_nf)}</td>
                    <td>{formatQuantity(item.total_distribuido)} L</td>
                    <td>
                      <Destinations destinations={item.destinos} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={report.pagination} onPage={onPage} />
        </>
      ) : (
        <EmptyReport message="Nenhuma entrada encontrada no período filtrado." />
      )}
    </section>
  );
}
function Destinations({
  destinations,
}: {
  destinations: EntradasRelatorioResponse["items"][number]["destinos"];
}) {
  if (!destinations.length)
    return <span className="entrada-report-muted">Sem destinos</span>;
  return (
    <details className="entrada-report-destinations">
      <summary>{destinations.length} destino(s)</summary>
      {destinations.map((item) => (
        <span key={item.ponto_id}>
          {item.ponto_codigo} — {formatQuantity(item.litros)} L
        </span>
      ))}
    </details>
  );
}
function Pagination({
  pagination,
  onPage,
}: {
  pagination: EntradasRelatorioResponse["pagination"];
  onPage: (page: number) => void;
}) {
  if (pagination.total_pages <= 1) return null;
  return (
    <footer className="historico-pagination">
      <button
        className="button button--secondary"
        disabled={pagination.page <= 1}
        onClick={() => onPage(pagination.page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {pagination.page} de {pagination.total_pages}
      </span>
      <button
        className="button button--secondary"
        disabled={pagination.page >= pagination.total_pages}
        onClick={() => onPage(pagination.page + 1)}
      >
        Próxima
      </button>
    </footer>
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
function formatPeriod(value: string | number) {
  const [year, month, day] = String(value).split("-");
  return day ? `${day}/${month}/${year}` : `${month}/${year}`;
}
function EmptyReport({
  message = "Nenhuma entrada encontrada no período filtrado.",
}: {
  message?: string;
}) {
  return <div className="relatorio-empty">{message}</div>;
}
