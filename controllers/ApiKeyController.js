'use strict';
const ApiKeyService = require('../services/ApiKeyService');
const svc = new ApiKeyService();
class ApiKeyController {
  async list(req,res)   { try{res.json(await svc.list());}catch(e){res.status(500).json({error:e.message});} }
  async create(req,res) { try{const{name,scopes,expiresAt}=req.body;res.status(201).json(await svc.create({name,scopes,expiresAt,createdBy:req.user.username}));}catch(e){res.status(e.status||500).json({error:e.message});} }
  async update(req,res) { try{res.json(await svc.update(req.params.id,req.body,req.user.username));}catch(e){res.status(e.status||500).json({error:e.message});} }
  async revoke(req,res) { try{await svc.revoke(req.params.id,req.user.username);res.json({success:true});}catch(e){res.status(e.status||500).json({error:e.message});} }
  async remove(req,res) { try{await svc.remove(req.params.id,req.user.username);res.json({success:true});}catch(e){res.status(e.status||500).json({error:e.message});} }
}
module.exports = ApiKeyController;
