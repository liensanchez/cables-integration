// src/services/odooService.js
const axios = require('axios');
require('dotenv').config();

const odooUrl = process.env.ODOO_XMLRPC_URL; // Example: http://localhost:8069
const odooDb = process.env.ODOO_DB;
const odooUsername = process.env.ODOO_USER;
const odooPassword = process.env.ODOO_PASS;

/** 
 * Mock inventory format:
 * [
 *   { meliId: 'MLA123456', availableQuantity: 10 },
 *   ...
 * ]
 */
async function getInventory() {
  // Replace this with real Odoo logic (XML-RPC or REST)
  return [
    { meliId: 'MLA123456', availableQuantity: 12 },
    { meliId: 'MLA654321', availableQuantity: 5 },
  ];
}

async function pushOrdersToOdoo(meliOrders) {
  const results = [];

  for (const order of meliOrders) {
    try {
      // Format and push to Odoo (via RPC or REST)
      console.log('Creating order in Odoo:', order.id);
      results.push({ orderId: order.id, status: 'created' });
    } catch (err) {
      results.push({ orderId: order.id, status: 'error', error: err.message });
    }
  }

  return results;
}

module.exports = {
  getInventory,
  pushOrdersToOdoo,
};
