import "dotenv/config";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { test } from "node:test";
import { app } from "../src/app.js";
import { pool } from "../src/config/database.js";
import { testCatalog } from "./support/fixtures.js";

async function serverUrl() {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function bufferFrom(response: Response) {
  return response.arrayBuffer().then((value) => Buffer.from(value));
}
function hasValue(sheet: ExcelJS.Worksheet, value: string | number) {
  return sheet
    .getRows(1, sheet.actualRowCount)
    .some((row) => row.values.some((cell) => cell === value));
}

test("exportações de abastecimentos cobrem filtros, conjunto vazio, PDF e tipos numéricos", async () => {
  const catalog = await testCatalog();
  const ids: string[] = [];
  await pool.query(
    "DELETE FROM abastecimentos WHERE origem_sistema='TEST' AND identificador_externo LIKE 'EXPORT-%'",
  );
  const rows = [
    ["EXPORT-FROTA", "FROTA", catalog.fleet.id, null, 12.345, 123.4567, 0, 0],
    [
      "EXPORT-TERCEIRO",
      "TERCEIRO",
      null,
      catalog.third.id,
      20,
      200,
      null,
      null,
    ],
  ] as const;
  for (const [
    external,
    type,
    fleetId,
    thirdId,
    liters,
    value,
    km,
    horimetro,
  ] of rows) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO abastecimentos (origem_sistema, identificador_externo, data_hora, produto_id, obra_id, tipo_destinatario, frota_id, terceiro_id, identificacao_original, litros, valor_total, arquivo_nome_original, payload_original, km_hr, horimetro) VALUES ('TEST',$1::text,'2026-09-20 07:00',$2,$3,$4,$5,$6,$1::text,$7,$8,'export-fixture.xlsx','{}',$9,$10) RETURNING id`,
      [
        external,
        catalog.product.id,
        catalog.obra.id,
        type,
        fleetId,
        thirdId,
        liters,
        value,
        km,
        horimetro,
      ],
    );
    ids.push(result.rows[0]!.id);
  }
  const { server, url } = await serverUrl();
  try {
    const excelResponse = await fetch(
      `${url}/abastecimento/relatorios/exportar/excel`,
    );
    assert.equal(excelResponse.status, 200);
    assert.match(
      excelResponse.headers.get("content-type") || "",
      /spreadsheetml/,
    );
    assert.match(
      excelResponse.headers.get("content-disposition") || "",
      /attachment/,
    );
    assert.match(
      excelResponse.headers.get("content-disposition") || "",
      /\.xlsx/,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await bufferFrom(excelResponse));
    assert.deepEqual(
      workbook.worksheets.map((sheet) => sheet.name),
      ["Resumo", "Abastecimentos"],
    );
    const detail = workbook.getWorksheet("Abastecimentos")!;
    const detailRows = detail.getRows(1, detail.rowCount);
    const frotaRow = detailRows.find((row) => row.values.some((cell) => cell === "EXPORT-FROTA"))!;
    const thirdRow = detailRows.find((row) => row.values.some((cell) => cell === "EXPORT-TERCEIRO"))!;
    assert.equal(typeof frotaRow.getCell(4).value, "number");
    assert.equal(frotaRow.getCell(4).value, 12.345);
    assert.equal(typeof frotaRow.getCell(5).value, "number");
    assert.equal(typeof frotaRow.getCell(10).value, "number");
    assert.equal(frotaRow.getCell(10).value, 0);
    assert.equal(typeof frotaRow.getCell(11).value, "number");
    assert.equal(frotaRow.getCell(11).value, 0);
    assert.equal(thirdRow.getCell(10).value, null);
    assert.equal(thirdRow.getCell(11).value, null);
    const pdfResponse = await fetch(
      `${url}/abastecimento/relatorios/exportar/pdf`,
    );
    assert.equal(pdfResponse.status, 200);
    assert.match(
      pdfResponse.headers.get("content-type") || "",
      /application\/pdf/,
    );
    assert.match(
      pdfResponse.headers.get("content-disposition") || "",
      /attachment/,
    );
    assert.match(pdfResponse.headers.get("content-disposition") || "", /\.pdf/);
    const pdf = await bufferFrom(pdfResponse);
    assert.ok(pdf.length > 0);
    assert.equal(pdf.toString("latin1", 0, 4), "%PDF");
    assert.equal(
      (
        await fetch(
          `${url}/abastecimento/relatorios/exportar/excel?produto=DIESEL_S500`,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(
          `${url}/abastecimento/relatorios/exportar/pdf?tipo_destinatario=TERCEIRO`,
        )
      ).status,
      200,
    );
    const emptyExcel = await fetch(
      `${url}/abastecimento/relatorios/exportar/excel?data_inicio=2000-01-01&data_fim=2000-01-02`,
    );
    assert.equal(emptyExcel.status, 200);
    const emptyWorkbook = new ExcelJS.Workbook();
    await emptyWorkbook.xlsx.load(await bufferFrom(emptyExcel));
    assert.deepEqual(
      emptyWorkbook.worksheets.map((sheet) => sheet.name),
      ["Resumo", "Abastecimentos"],
    );
    const emptyPdf = await fetch(
      `${url}/abastecimento/relatorios/exportar/pdf?data_inicio=2000-01-01&data_fim=2000-01-02`,
    );
    assert.equal(emptyPdf.status, 200);
    assert.equal((await bufferFrom(emptyPdf)).toString("latin1", 0, 4), "%PDF");
    assert.ok(hasValue(workbook.getWorksheet("Resumo")!, "Resumo"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.query("DELETE FROM abastecimentos WHERE id = ANY($1::uuid[])", [
      ids,
    ]);
  }
});

test("exportações de entradas cobrem filtros, NF repetida, destinos, ARLA, conjunto vazio e tipos numéricos", async () => {
  const catalog = await testCatalog();
  const arla = (
    await pool.query<{ id: string }>(
      "SELECT id FROM abastecimento_produtos WHERE codigo='ARLA_32'",
    )
  ).rows[0]!;
  const point = (
    await pool.query<{ id: string }>(
      "SELECT id FROM abastecimento_pontos WHERE codigo='CC01'",
    )
  ).rows[0]!;
  const secondPoint = (
    await pool.query<{ id: string }>(
      "SELECT id FROM abastecimento_pontos WHERE codigo='CC02'",
    )
  ).rows[0]!;
  const entries: string[] = [];
  const first = (
    await pool.query<{ id: string }>(
      `INSERT INTO abastecimento_entradas(data_entrada,numero_nf,produto_id,litros_nf,valor_total_nf) VALUES ('2026-09-20','EXPORT-NF',$1,100,500) RETURNING id`,
      [catalog.product.id],
    )
  ).rows[0]!.id;
  const second = (
    await pool.query<{ id: string }>(
      `INSERT INTO abastecimento_entradas(data_entrada,numero_nf,produto_id,litros_nf,valor_total_nf) VALUES ('2026-09-21','EXPORT-NF',$1,50,250) RETURNING id`,
      [arla.id],
    )
  ).rows[0]!.id;
  entries.push(first, second);
  await pool.query(
    "INSERT INTO abastecimento_entrada_destinos(entrada_id,ponto_id,litros) VALUES ($1,$2,60),($1,$3,40)",
    [first, point.id, secondPoint.id],
  );
  const { server, url } = await serverUrl();
  try {
    const excelResponse = await fetch(
      `${url}/abastecimento/relatorios/entradas/exportar/excel`,
    );
    assert.equal(excelResponse.status, 200);
    assert.match(
      excelResponse.headers.get("content-type") || "",
      /spreadsheetml/,
    );
    assert.match(
      excelResponse.headers.get("content-disposition") || "",
      /attachment/,
    );
    assert.match(
      excelResponse.headers.get("content-disposition") || "",
      /\.xlsx/,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await bufferFrom(excelResponse));
    assert.deepEqual(
      workbook.worksheets.map((sheet) => sheet.name),
      ["Resumo", "Entradas", "Destinos"],
    );
    const entriesSheet = workbook.getWorksheet("Entradas")!;
    const entryRows = entriesSheet
      .getRows(1, entriesSheet.rowCount)
      .filter((row) => row.values.some((cell) => cell === "EXPORT-NF"));
    assert.equal(entryRows.length, 2);
    const entryRow = entryRows.find((row) => row.getCell(4).value === 100)!;
    assert.equal(typeof entryRow.getCell(4).value, "number");
    assert.equal(typeof entryRow.getCell(5).value, "number");
    assert.equal(typeof entryRow.getCell(6).value, "number");
    const destinations = workbook.getWorksheet("Destinos")!;
    const destinationRow = destinations
      .getRows(1, destinations.rowCount)
      .find((row) => row.getCell(5).value === "CC01")!;
    assert.equal(typeof destinationRow.getCell(6).value, "number");
    assert.equal(destinationRow.getCell(6).value, 60);
    assert.ok(
      hasValue(entriesSheet, "ARLA_32") || hasValue(entriesSheet, "ARLA 32"),
    );
    const destinationRows = destinations
      .getRows(1, destinations.rowCount)
      .filter((row) => row.getCell(5).value === "CC01" || row.getCell(5).value === "CC02");
    assert.equal(destinationRows.length, 2);
    const pdfResponse = await fetch(
      `${url}/abastecimento/relatorios/entradas/exportar/pdf`,
    );
    assert.equal(pdfResponse.status, 200);
    assert.match(
      pdfResponse.headers.get("content-type") || "",
      /application\/pdf/,
    );
    assert.match(
      pdfResponse.headers.get("content-disposition") || "",
      /attachment/,
    );
    assert.match(pdfResponse.headers.get("content-disposition") || "", /\.pdf/);
    assert.equal(
      (await bufferFrom(pdfResponse)).toString("latin1", 0, 4),
      "%PDF",
    );
    assert.equal(
      (
        await fetch(
          `${url}/abastecimento/relatorios/entradas/exportar/excel?produto_id=${catalog.product.id}`,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(
          `${url}/abastecimento/relatorios/entradas/exportar/pdf?ponto_id=${point.id}`,
        )
      ).status,
      200,
    );
    const emptyExcel = await fetch(
      `${url}/abastecimento/relatorios/entradas/exportar/excel?data_inicio=2000-01-01&data_fim=2000-01-02`,
    );
    assert.equal(emptyExcel.status, 200);
    const emptyWorkbook = new ExcelJS.Workbook();
    await emptyWorkbook.xlsx.load(await bufferFrom(emptyExcel));
    assert.deepEqual(
      emptyWorkbook.worksheets.map((sheet) => sheet.name),
      ["Resumo", "Entradas", "Destinos"],
    );
    const emptyPdf = await fetch(
      `${url}/abastecimento/relatorios/entradas/exportar/pdf?data_inicio=2000-01-01&data_fim=2000-01-02`,
    );
    assert.equal(emptyPdf.status, 200);
    assert.equal((await bufferFrom(emptyPdf)).toString("latin1", 0, 4), "%PDF");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.query(
      "DELETE FROM abastecimento_entrada_destinos WHERE entrada_id = ANY($1::uuid[])",
      [entries],
    );
    await pool.query(
      "DELETE FROM abastecimento_entradas WHERE id = ANY($1::uuid[])",
      [entries],
    );
  }
});
