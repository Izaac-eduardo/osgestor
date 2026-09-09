import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { pool } from '../../src/config/database.js';

test('CLI lê XLSX real, gera relatório de dry-run e reverte todos os registros', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'osgestor-frotas-'));
  const source = join(directory, 'fixture.xlsx'), reportFile = join(directory, 'report.json');
  const prefix = 'ZT' + randomBytes(4).toString('hex').toUpperCase().replace(/[0-9]/g, value => String.fromCharCode(71 + Number(value)));
  try {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Teste');
    sheet.addRows([['Frota', 'Descrição', 'Modelo', 'Ano'],
      [prefix + '-09', 'Máquina', '416 4', 2022], [prefix + '-04', 'Equipamento', '416 4', 2023]]);
    await book.xlsx.writeFile(source);
    await promisify(execFile)(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'),
      resolve('database/imports/import-frotas.ts'), source, '--report', reportFile], { maxBuffer: 1024 * 1024 });
    const report = JSON.parse(await readFile(reportFile, 'utf8'));
    assert.equal(report.mode, 'dry-run'); assert.equal(report.committed, false); assert.equal(report.outcome, 'rolled-back');
    assert.equal(report.counts.inserted, 2); assert.equal(report.counts.prefixesCreated, 1);
    assert.equal(report.duplicateModels.length, 1); assert.equal(report.rows[0].numero, '09');
    assert.equal((await pool.query('SELECT count(*)::int n FROM prefixos_frota WHERE codigo=$1', [prefix])).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM frotas WHERE codigo IN ($1,$2)', [prefix + '09', prefix + '04'])).rows[0].n, 0);
  } finally {
    for (const file of [source, reportFile]) await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(directory);
    await pool.end();
  }
});