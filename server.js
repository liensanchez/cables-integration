// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// *MERCADO LIBRE*
const MercadoLibreService = require('./src/services/mercadolibre/meliService');
const meliService = new MercadoLibreService();
app.use('/api/meli', require('./src/routes/meliRoutes')(meliService));


/* const AmazonService = require('./src/services/amazon/amazonService'); */
/* const ShopifyService = require('./src/services/shopify/shopifyService'); */

// Initialize services
/* const amazonService = new AmazonService(); */
/* const shopifyService = new ShopifyService(); */

// Routes
/* app.use('/api/amazon', require('./src/routes/amazonRoutes')(amazonService)); */
/* app.use('/api/shopify', require('./src/routes/shopifyRoutes')(shopifyService)); */

// Scheduled jobs
cron.schedule('*/15 * * * *', () => {
  console.log('Running scheduled inventory sync');
  /* amazonService.syncInventoryToAmazon(); */
  /* meliService.syncInventoryToMeli(); */
});

cron.schedule('*/5 * * * *', () => {
  console.log('Running scheduled order processing');
  /* amazonService.processAmazonOrders(); */
  /* meliService.processMeliOrders(); */
  /* shopifyService.processShopifyOrders(); */
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`Integration hub running on port ${PORT}`);
});