// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');
const mongoose = require("mongoose");

mongoose
    .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/cables-stock", {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// *MERCADO LIBRE*
const MercadoLibreService = require('./src/services/mercadolibre/meliService');
const meliService = new MercadoLibreService();

// *ODOO*
const odooService = require('./src/services/odooService');
const odooSer = new odooService();

app.use('/api/meli', require('./src/routes/meliRoutes')(meliService));
app.use('/api/sync', require('./src/routes/routes.js')(odooSer, meliService));


/* const AmazonService = require('./src/services/amazon/amazonService'); */
/* const ShopifyService = require('./src/services/shopify/shopifyService'); */

// Initialize services
/* const amazonService = new AmazonService(); */
/* const shopifyService = new ShopifyService(); */

// Routes
/* app.use('/api/amazon', require('./src/routes/amazonRoutes')(amazonService)); */
/* app.use('/api/shopify', require('./src/routes/shopifyRoutes')(shopifyService)); */


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`Integration hub running on port ${PORT}`);
});