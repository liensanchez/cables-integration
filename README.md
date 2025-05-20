# cables-integration

## Project Structure

```
cables-integration/
├── .env                    # Environment configuration
├── .gitignore
├── package.json            # Project metadata and dependencies
├── server.js               # Main application entry point
│
└── src/                    # Source code directory
    ├── config/             # Configuration files
    │   ├── amazon.js       # Amazon API credentials and settings
    │   ├── mercadolibre.js # MercadoLibre API configuration
    │   ├── shopify.js      # Shopify API parameters
    │   └── odoo.js         # Odoo ERP connection details
    │
    ├── controllers/        # Route handlers
    │   ├── amazonController.js # Amazon-specific endpoints
    │   ├── meliController.js   # MercadoLibre endpoints
    │   └── shopifyController.js # Shopify webhook handlers
    │
    ├── services/           # Business logic layer
    │   ├── amazon/         # Amazon integration service
    │   │   ├── amazonAPI.js      # Raw API calls
    │   │   ├── amazonService.js  # Business logic
    │   │   └── transformers.js   # Data format converters
    │   │
    │   ├── mercadolibre/   # MercadoLibre service
    │   │   ├── meliAPI.js
    │   │   ├── meliService.js
    │   │   └── transformers.js
    │   │
    │   ├── shopify/        # Shopify integration
    │   │   ├── shopifyAPI.js
    │   │   ├── shopifyService.js
    │   │   └── transformers.js
    │   │
    │   └── odooService.js  # Shared Odoo integration
    │
    ├── models/             # Data models
    │   ├── Log.js          # Logging schema
    │   ├── SyncStatus.js   # Last sync timestamps
    │   └── ErrorQueue.js   # Failed operations retry queue
    │
    ├── routes/             # Express route definitions
    │   ├── amazonRoutes.js
    │   ├── meliRoutes.js
    │   └── shopifyRoutes.js
    │
    ├── utils/              # Shared utilities
    │   ├── logger.js       # Custom logging system
    │   ├── alertService.js # Error notifications
    │   ├── queueManager.js # Bull queue setup
    │   └── helpers.js      # Common functions
    │
    └── workers/            # Background job processors
        ├── inventorySync.js # Scheduled inventory updates
        ├── orderProcessor.js # Order import jobs
        └── errorHandler.js  # Failed operation retries

```

## URL For get the auth

```
https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=2280470099740879&redirect_uri=https://demo.liensdev.com/api/meli/auth/user
```

## Curl to test the webhook

```
curl -X POST   http://localhost:3000/api/meli/notifications   -H 'Content-Type: application/json'   -d '{
    "_id": "c82d4525-9ad3-4cce-80e8-9ef25757e9a0",
    "topic": "orders_v2",
    "resource": "/orders/2000011666506538",
    "user_id": 2433473049,
    "application_id": 2280470099740879,
    "sent": "2025-05-20T03:05:23.527Z",
    "attempts": 1,
    "received": "2025-05-20T03:05:23.364Z",
    "actions": []
  }'

```
