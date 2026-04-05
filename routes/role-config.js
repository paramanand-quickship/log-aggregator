'use strict';
const {Router}=require('express');
const {RoleConfigService,ALL_PAGES,ALL_CARDS}=require('../services/RoleConfigService');
const {authenticate}=require('../middleware/auth');
const requireRole=require('../middleware/roles');
const router=Router(), svc=new RoleConfigService(), admin=[authenticate,requireRole('admin')];

router.get('/', authenticate, async(req,res)=>{
  try { res.json({roles:await svc.getRoles(), catalogue:{pages:ALL_PAGES,cards:ALL_CARDS}}); }
  catch(e){res.status(500).json({error:e.message});}
});
router.put('/:name',   ...admin,async(req,res)=>{try{res.json(await svc.upsertRole(req.params.name,req.body));}catch(e){res.status(e.status||500).json({error:e.message});}});
router.delete('/:name',...admin,async(req,res)=>{try{await svc.deleteRole(req.params.name);res.json({success:true});}catch(e){res.status(e.status||500).json({error:e.message});}});
module.exports=router;
