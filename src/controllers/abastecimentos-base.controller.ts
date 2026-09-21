import type { Request, Response } from 'express';
import {
  AbastecimentoServiceError, assertUuid, createAbastecimentoEntrada, createAbastecimentoEspecial, createAbastecimentoPonto, createAbastecimentoTerceiro, deleteAbastecimentoEntrada, deleteAbastecimentoEspecial, deleteAbastecimentoPonto, deleteAbastecimentoTerceiro, getAbastecimentoEntrada, getAbastecimentoEspecial, getAbastecimentoPonto, getAbastecimentoTerceiro, listAbastecimentoEntradas, listAbastecimentoEspeciais, listAbastecimentoPontos, listAbastecimentoProdutos, listAbastecimentoTerceiros, listPontoProdutos, replacePontoProdutos, updateAbastecimentoEntrada, updateAbastecimentoEspecial, updateAbastecimentoPonto, updateAbastecimentoPontoStatus, updateAbastecimentoTerceiro,
} from '../services/abastecimentos-base.service.js';
import { createTerceiroIdentificacao, deleteTerceiroIdentificacao, listTerceiroIdentificacoes, updateTerceiroIdentificacao } from '../services/abastecimentos-terceiro-identificacoes.service.js';

const queryText = (value: unknown): string | undefined => value === undefined ? undefined : typeof value === 'string' ? value : (() => { throw new AbastecimentoServiceError(400, 'Filtro deve ser texto.'); })();
const id = (request: Request): string => assertUuid(request.params.id);
const action = (handler: (request: Request, response: Response) => Promise<void>) => async (request: Request, response: Response): Promise<void> => { try { await handler(request, response); } catch (error) { if (error instanceof AbastecimentoServiceError) { response.status(error.statusCode).json({ message: error.message }); return; } console.error('Erro interno no módulo de abastecimentos.'); response.status(500).json({ message: 'Erro interno do servidor.' }); } };

export const listProdutos = action(async (_req,res)=>{res.json(await listAbastecimentoProdutos());});
export const listPontos = action(async (req,res)=>{res.json(await listAbastecimentoPontos({status:queryText(req.query.status),codigo:queryText(req.query.codigo),tipo:queryText(req.query.tipo)}));});
export const getPonto = action(async (req,res)=>{res.json(await getAbastecimentoPonto(id(req)));});
export const createPonto = action(async (req,res)=>{res.status(201).json(await createAbastecimentoPonto(req.body));});
export const updatePonto = action(async (req,res)=>{res.json(await updateAbastecimentoPonto(id(req),req.body));});
export const statusPonto = action(async (req,res)=>{res.json(await updateAbastecimentoPontoStatus(id(req),req.body));});
export const deletePonto = action(async (req,res)=>{await deleteAbastecimentoPonto(id(req));res.status(204).send();});
export const listCompatibilidade = action(async (req,res)=>{res.json(await listPontoProdutos(id(req)));});
export const replaceCompatibilidade = action(async (req,res)=>{res.json(await replacePontoProdutos(id(req),req.body));});
export const listTerceiros = action(async (req,res)=>{res.json(await listAbastecimentoTerceiros({status:queryText(req.query.status),codigo:queryText(req.query.codigo),nome:queryText(req.query.nome)}));});
export const getTerceiro = action(async (req,res)=>{res.json(await getAbastecimentoTerceiro(id(req)));});
export const createTerceiro = action(async (req,res)=>{res.status(201).json(await createAbastecimentoTerceiro(req.body));});
export const updateTerceiro = action(async (req,res)=>{res.json(await updateAbastecimentoTerceiro(id(req),req.body));});
export const deleteTerceiro = action(async (req,res)=>{await deleteAbastecimentoTerceiro(id(req));res.status(204).send();});
export const listTerceiroIdentificacoesController = action(async (req,res)=>{res.json(await listTerceiroIdentificacoes(id(req)));});
export const createTerceiroIdentificacaoController = action(async (req,res)=>{res.status(201).json(await createTerceiroIdentificacao(id(req), req.body));});
export const updateTerceiroIdentificacaoController = action(async (req,res)=>{res.json(await updateTerceiroIdentificacao(id(req), String(req.params.identificacaoId), req.body));});
export const deleteTerceiroIdentificacaoController = action(async (req,res)=>{await deleteTerceiroIdentificacao(id(req), String(req.params.identificacaoId));res.status(204).send();});
export const listEspeciais = action(async (req,res)=>{res.json(await listAbastecimentoEspeciais({status:queryText(req.query.status)}));});
export const getEspecial = action(async (req,res)=>{res.json(await getAbastecimentoEspecial(id(req)));});
export const createEspecial = action(async (req,res)=>{res.status(201).json(await createAbastecimentoEspecial(req.body));});
export const updateEspecial = action(async (req,res)=>{res.json(await updateAbastecimentoEspecial(id(req),req.body));});
export const deleteEspecial = action(async (req,res)=>{await deleteAbastecimentoEspecial(id(req));res.status(204).send();});
export const listEntradas = action(async (req,res)=>{res.json(await listAbastecimentoEntradas({data_inicio:queryText(req.query.data_inicio),data_fim:queryText(req.query.data_fim),produto_id:queryText(req.query.produto_id),produto_codigo:queryText(req.query.produto_codigo),numero_nf:queryText(req.query.numero_nf),ponto_id:queryText(req.query.ponto_id)}));});
export const getEntrada = action(async (req,res)=>{res.json(await getAbastecimentoEntrada(id(req)));});
export const createEntrada = action(async (req,res)=>{res.status(201).json(await createAbastecimentoEntrada(req.body));});
export const updateEntrada = action(async (req,res)=>{res.json(await updateAbastecimentoEntrada(id(req),req.body));});
export const deleteEntrada = action(async (req,res)=>{await deleteAbastecimentoEntrada(id(req));res.status(204).send();});
