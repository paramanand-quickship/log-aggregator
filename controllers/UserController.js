'use strict';
const UserService = require('../services/UserService');
const svc = new UserService();

class UserController {
  async list         (req, res) { try { res.json(await svc.getAll()); } catch (e) { res.status(500).json({ error: e.message }); } }
  async create       (req, res) { try { const { username, password, role } = req.body; res.status(201).json(await svc.add(username, password, role, req.user.username)); } catch (e) { res.status(e.status||500).json({ error: e.message }); } }
  async updateRole   (req, res) { try { await svc.updateRole(req.params.username, req.body.role, req.user.username); res.json({ success: true }); } catch (e) { res.status(e.status||500).json({ error: e.message }); } }
  async resetPassword(req, res) { try { await svc.resetPassword(req.params.username, req.body.newPassword, req.user.username); res.json({ success: true }); } catch (e) { res.status(e.status||500).json({ error: e.message }); } }
  async remove       (req, res) { try { await svc.remove(req.params.username, req.user.username); res.json({ success: true }); } catch (e) { res.status(e.status||500).json({ error: e.message }); } }
  async revoke2fa    (req, res) { try { await svc.revoke2fa(req.params.username, req.user.username); res.json({ success: true }); } catch (e) { res.status(e.status||500).json({ error: e.message }); } }
}
module.exports = UserController;
