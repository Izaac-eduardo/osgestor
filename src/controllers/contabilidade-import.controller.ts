import type { Request, Response } from 'express';
import { analisarContabilidade, ContabilidadeImportError, confirmarContabilidade, getContabilidadeImport, listContabilidadeImports, listContabilidadeItems, updateContabilidadeItem } from '../services/contabilidade-import.service.js';

const previewToken = (value: string | string[] | undefined): string => { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) throw new ContabilidadeImportError(400, 'token de prévia inválido.'); return value; };

const sendError = (response: Response, error: unknown): void => { if (error instanceof ContabilidadeImportError) { response.status(error.statusCode).json({ message: error.message }); return; } console.error('Erro interno na importação contábil.'); response.status(500).json({ message: 'Erro interno do servidor.' }); };
const id = (value: string | string[] | undefined): string => { if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new ContabilidadeImportError(400, 'id inválido.'); return value; };

export async function analyze(request: Request, response: Response): Promise<void> { try { const file = (request as Request & { file?: { buffer: Buffer; originalname: string } }).file; if (!file) { response.status(400).json({ message: 'Envie um arquivo XLS ou XLSX no campo arquivo.' }); return; } response.status(200).json(await analisarContabilidade(file.buffer, file.originalname)); } catch (error) { sendError(response, error); } }
export async function confirm(request: Request, response: Response): Promise<void> { try { response.status(201).json(await confirmarContabilidade(previewToken(request.params.id), request.authUser)); } catch (error) { sendError(response, error); } }
export async function list(_request: Request, response: Response): Promise<void> { try { response.json(await listContabilidadeImports()); } catch (error) { sendError(response, error); } }
export async function get(request: Request, response: Response): Promise<void> { try { const importacaoId = id(request.params.id); response.json({ importacao: await getContabilidadeImport(importacaoId), itens: await listContabilidadeItems(importacaoId) }); } catch (error) { sendError(response, error); } }
export async function update(request: Request, response: Response): Promise<void> { try { response.json(await updateContabilidadeItem(id(request.params.itemId), request.body ?? {}, request.authUser)); } catch (error) { sendError(response, error); } }
