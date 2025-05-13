const MeliAPI = require('./meliAPI');
const odooService = require('../../services/odooService');
/* const ErrorQueue = require('../../models/ErrorQueue'); // Assuming Mongoose */

class MercadoLibreService {
  constructor() {
    this.meliAPI = new MeliAPI(); // instance to handle raw API calls
  }

  /** Step 1: Handle OAuth token exchange */
  async exchangeCodeForToken(code, redirectUri) {
    try {
      const tokens = await this.meliAPI.getAccessToken(code, redirectUri);
      // You can persist the token in DB or file for reuse
      console.log('Access Token:', tokens.access_token);
      return tokens;
    } catch (error) {
        console.error('Error exchanging code for token:', error);
      /* await this.logError('exchangeCodeForToken', error);
      throw error; */
    }
  }

  /** Step 2: Sync Odoo inventory to Mercado Libre */
  async syncInventoryToMeli() {
    try {
      const odooInventory = await odooService.getInventory(); // implement this
      const result = await this.meliAPI.updateInventory(odooInventory);
      return result;
    } catch (error) {
        console.error('Error syncing inventory to Meli:', error);
      /* await this.logError('syncInventoryToMeli', error);
      throw error; */
    }
  }

  /** Step 3: Fetch Mercado Libre orders and push to Odoo */
  async processMeliOrders() {
    try {
      const orders = await this.meliAPI.fetchRecentOrders(); // get orders
      const result = await odooService.pushOrdersToOdoo(orders); // insert into Odoo
      console.log('Orders to be processed:', orders);
      return result;
    } catch (error) {
        console.error('Error processing Meli orders:', error);
      /* await this.logError('processMeliOrders', error);
      throw error; */
    }
  }

  /** Step 4: Get list of errors from the queue */
  async getErrorQueue() {
    try {
      return await ErrorQueue.find({ service: 'mercadolibre' }).lean();
    } catch (error) {
      throw new Error('Failed to load error queue');
    }
  }

  /** Optional helper: Log error for retries */
  async logError(method, error) {
    const entry = new ErrorQueue({
      service: 'mercadolibre',
      method,
      message: error.message || 'Unknown error',
      stack: error.stack || '',
      timestamp: new Date(),
    });
    await entry.save();
  }
}

module.exports = MercadoLibreService;
