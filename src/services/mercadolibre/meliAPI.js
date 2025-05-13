// src/services/mercadolibre/meliAPI.js
const axios = require('axios');
const qs = require('qs');
require('dotenv').config();

class MeliAPI {
  constructor() {
    this.clientId = process.env.MELI_CLIENT_ID;
    this.clientSecret = process.env.MELI_CLIENT_SECRET;
    this.redirectUri = process.env.MELI_REDIRECT_URI;
    this.baseUrl = 'https://api.mercadolibre.com';
    this.token = null; // Optional: implement persistent storage
  }

  /** Exchange auth code for access + refresh token */
  async getAccessToken(code, redirectUri = this.redirectUri) {
    const data = {
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: redirectUri,
    };

    const response = await axios.post(`${this.baseUrl}/oauth/token`, qs.stringify(data), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.token = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
    return response.data;
  }

  /** Refresh the access token */
  async refreshAccessToken(refreshToken) {
    const data = {
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    };

    const response = await axios.post(`${this.baseUrl}/oauth/token`, qs.stringify(data), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.token = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
    return response.data;
  }

  /** Update inventory on Mercado Libre */
  async updateInventory(items) {
    const updated = [];

    for (const item of items) {
      try {
        const { meliId, availableQuantity } = item;

        const res = await axios.put(
          `${this.baseUrl}/items/${meliId}`,
          { available_quantity: availableQuantity },
          { headers: { Authorization: `Bearer ${this.token}` } }
        );

        updated.push({ meliId, status: 'updated', response: res.data });
      } catch (err) {
        updated.push({ meliId: item.meliId, status: 'error', error: err.message });
      }
    }

    return updated;
  }

  /** Fetch recent orders (last 24h) */
  async fetchRecentOrders() {
    const date = new Date();
    date.setDate(date.getDate() - 1); // last 24h
    const from = date.toISOString();

    const response = await axios.get(
      `${this.baseUrl}/orders/search?seller=${process.env.MELI_USER_ID}&order.date_created.from=${from}`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );

    return response.data.results || [];
  }
}

module.exports = MeliAPI;
