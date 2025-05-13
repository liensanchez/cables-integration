// src/routes/meliRoutes.js
const express = require('express');
const router = express.Router();

module.exports = (meliService) => {
  // 1. Verificar credenciales de Mercado Libre
  router.post('/auth', async (req, res, next) => {
    try {
      const { code, redirectUri } = req.body;
      const tokens = await meliService.exchangeCodeForToken(code, redirectUri);
      res.json(tokens);
    } catch (err) {
      next(err);
    }
  });

  // 2. Sincronizar inventario de Odoo a Mercado Libre
  router.post('/sync-inventory', async (req, res, next) => {
    try {
      const result = await meliService.syncInventoryToMeli();
      res.json({ success: true, result });
    } catch (err) {
      next(err);
    }
  });

  // 3. Insertar pedidos desde Mercado Libre a Odoo
  router.post('/sync-orders', async (req, res, next) => {
    try {
      const result = await meliService.processMeliOrders();
      res.json({ success: true, result });
    } catch (err) {
      next(err);
    }
  });

  // 4. Ver errores pendientes / reintentos
  router.get('/errors', async (req, res, next) => {
    try {
      const errors = await meliService.getErrorQueue();
      res.json(errors);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
