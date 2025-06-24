// src/services/mercadolibre/meliAPI.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const qs = require("qs");
require("dotenv").config();

class MeliAPI {
    constructor() {
        this.clientId = process.env.MELI_CLIENT_ID;
        this.clientSecret = process.env.MELI_CLIENT_SECRET;
        this.redirectUri = process.env.MELI_REDIRECT_URI;
        this.Username = process.env.MELI_USERNAME;
        this.Password = process.env.MELI_PASSWORD;
        this.baseUrl = "https://api.mercadolibre.com";
        this.token = null; // Will hold the access token
        this.refreshToken = null; // Will hold the refresh token
        this.userId = process.env.MELI_USER_ID; // Will hold the user info
    }

    // Exchange the authorization code for an access token
    async getAccessTokenWithCode(code) {
        try {
            const payload = new URLSearchParams({
                grant_type: "authorization_code",
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: code,
                redirect_uri: this.redirectUri,
            });

            const res = await axios.post(
                `${this.baseUrl}/oauth/token`,
                payload.toString(),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }
            );

            this.token = res.data.access_token;
            this.refreshToken = res.data.refresh_token; // Store the refresh token

            console.log("✅ Access token:", this.token);
            return res.data;
        } catch (error) {
            console.error(
                "❌ Failed to get access token:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    // Refresh the access token using the refresh token
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error("No refresh token available");
        }

        try {
            const payload = new URLSearchParams({
                grant_type: "refresh_token",
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.refreshToken,
            });

            const res = await axios.post(
                `${this.baseUrl}/oauth/token`,
                payload.toString(),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }
            );

            this.token = res.data.access_token; // Store the new access token
            console.log("✅ Refreshed access token:", this.token);

            return res.data;
        } catch (error) {
            console.error(
                "❌ Failed to refresh access token:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    // fetch the user's products
    async getUserProducts() {
        if (!this.token) {
            throw new Error("Access token is missing");
        }

        try {
            // Step 1: Get the user ID
            const userInfo = await axios.get(`${this.baseUrl}/users/me`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            const userId = userInfo.data.id;

            // Step 2: Get product IDs
            const itemsRes = await axios.get(
                `${this.baseUrl}/users/${userId}/items/search`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );

            const itemIds = itemsRes.data.results;

            if (itemIds.length === 0) return [];

            // Step 3: Fetch stock details for each item
            const products = await Promise.all(
                itemIds.map(async (itemId) => {
                    const res = await axios.get(
                        `${this.baseUrl}/items/${itemId}`,
                        {
                            headers: {
                                Authorization: `Bearer ${this.token}`,
                            },
                        }
                    );

                    const item = res.data;

                    return {
                        id: item.id,
                        title: item.title,
                        available_quantity: item.available_quantity,
                        sold_quantity: item.sold_quantity,
                        price: item.price,
                        status: item.status,
                    };
                })
            );

            return products;
        } catch (error) {
            console.error(
                "❌ Failed to fetch product stock:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    // fetch the user's orders
    async getUserOrders() {
        if (!this.token) {
            throw new Error("Access token is missing");
        }

        try {
            // Paso 1: Obtener el ID del usuario autenticado
            const userInfo = await axios.get(`${this.baseUrl}/users/me`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            const userId = userInfo.data.id;

            // Paso 2: Buscar las órdenes del vendedor
            const ordersRes = await axios.get(
                `${this.baseUrl}/orders/search?seller=${userId}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );

            // Paso 3: Transformar los datos relevantes para Odoo
            const orders = ordersRes.data.results.map((order) => ({
                id: order.id,
                status: order.status,
                date_created: order.date_created,
                total_amount: order.total_amount,
                currency: order.currency_id,
                buyer: {
                    id: order.buyer?.id,
                    nickname: order.buyer?.nickname,
                },
                order_items: order.order_items.map((item) => ({
                    sku: item.item?.seller_sku,
                    title: item.item?.title,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    currency: item.currency_id,
                })),
                payments: order.payments.map((payment) => ({
                    id: payment.id,
                    order_id: payment.order_id,
                    payer_id: payment.payer_id,
                    installments: payment.installments,
                    processing_mode: payment.processing_mode,
                    payment_method_id: payment.payment_method_id,
                    payment_type: payment.payment_type,
                    status: payment.status,
                    status_detail: payment.status_detail,
                    transaction_amount: payment.transaction_amount,
                    total_paid_amount: payment.total_paid_amount,
                    net_received_amount: payment.net_received_amount,
                    date_approved: payment.date_approved,
                    date_created: payment.date_created,
                })),
            }));

            return orders;
        } catch (error) {
            console.error(
                "❌ Failed to fetch orders:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    async getSingleOrder(orderId) {
        try {
            if (!this.token) {
                throw new Error("No access token available");
            }

            console.log(`Fetching order with ID: ${orderId}`);

            // Get the order
            const orderResponse = await axios.get(
                `${this.baseUrl}/orders/${orderId}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );
            const order = orderResponse.data;

            console.log(
                `Order retrieved successfully: ${JSON.stringify(order)}`
            );

            // Fix: Check if shipping exists and has id property
            if (
                !order.shipping ||
                order.shipping.id === undefined ||
                order.shipping.id === null
            ) {
                const logMessage = `⚠️ [${new Date().toISOString()}] No shipping ID found for order ID: ${orderId}\n`;
                const logFilePath = path.join(
                    __dirname,
                    "shipping_warnings.log"
                );

                fs.appendFile(logFilePath, logMessage, (err) => {
                    if (err) {
                        console.error("❌ Failed to write to log file:", err);
                    }
                });

                // Return the order without shipping details
                return {
                    id: order.id,
                    status: order.status,
                    date_created: order.date_created,
                    total_amount: order.total_amount,
                    currency: order.currency_id,
                    buyer: {
                        id: order.buyer.id,
                        nickname: order.buyer.nickname,
                        email: order.buyer.email,
                        phone: order.buyer.phone?.number || null,
                        first_name: order.buyer.first_name,
                        last_name: order.buyer.last_name,
                        identification: {
                            type: order.buyer.identification?.type || "ID",
                            number:
                                order.buyer.identification?.number ||
                                "No available",
                        },
                    },
                    shipping_info: null, // Explicitly set to null
                    billing_info: {
                        tax_payer_type:
                            order.buyer.tax_payer_type || "Consumidor Final",
                        buyer_name: `${order.buyer.first_name} ${order.buyer.last_name}`,
                        identification: {
                            type: order.buyer.identification?.type || "ID",
                            number:
                                order.buyer.identification?.number ||
                                "No available",
                        },
                    },
                    order_items: order.order_items.map((item) => ({
                        sku: item.item.seller_sku,
                        title: item.item.title,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        currency: item.currency_id,
                    })),
                    payments: order.payments.map((payment) => ({
                        id: payment.id,
                        payment_method: payment.payment_method_id,
                        status: payment.status,
                        status_detail: payment.status_detail,
                        total_paid: payment.total_paid_amount,
                        installments: payment.installments,
                        installment_amount: payment.transaction_amount,
                        date_approved: payment.date_approved,
                    })),
                };
            }

            console.log(
                `Fetching shipping details for shipping ID: ${order.shipping.id}`
            );

            // Get shipping information
            const shippingResponse = await axios.get(
                `${this.baseUrl}/shipments/${order.shipping.id}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );
            const shipping = shippingResponse.data;

            console.log(
                `Shipping details retrieved successfully: ${JSON.stringify(shipping)}`
            );

            const receiverAddress = shipping.receiver_address;

            const fullShippingAddress = [
                receiverAddress.street_name,
                receiverAddress.street_number,
                receiverAddress.comment,
                `${receiverAddress.zip_code} - ${receiverAddress.city.name}, ${receiverAddress.state.name}`,
            ]
                .filter(Boolean)
                .join(" - ");

            const fullBillingAddress = [
                receiverAddress.street_name,
                receiverAddress.street_number,
                `${receiverAddress.zip_code} - ${receiverAddress.city.name}, ${receiverAddress.state.name}`,
            ]
                .filter(Boolean)
                .join(" - ");

            const logisticType = shipping.logistic_type || null;

            return {
                id: order.id,
                status: order.status,
                date_created: order.date_created,
                total_amount: order.total_amount,
                currency: order.currency_id,
                buyer: {
                    id: order.buyer.id,
                    nickname: order.buyer.nickname,
                    email: order.buyer.email,
                    phone: order.buyer.phone?.number || null,
                    first_name: order.buyer.first_name,
                    last_name: order.buyer.last_name,
                    identification: {
                        type: order.buyer.identification?.type || "ID",
                        number:
                            order.buyer.identification?.number ||
                            "No available",
                    },
                },
                shipping_info: {
                    receiver_name: receiverAddress.receiver_name,
                    receiver_phone: receiverAddress.receiver_phone,
                    address: fullShippingAddress,
                    shipping_type: shipping.shipping_type,
                    shipping_cost: shipping.cost,
                    shipping_mode: shipping.shipping_mode,
                    shipping_status: shipping.status,
                    logistic_type: logisticType,
                    is_fulfillment: logisticType === "fulfillment",
                    shipping_id: order.shipping.id, // Include the shipping ID in the response
                },
                billing_info: {
                    tax_payer_type:
                        order.buyer.tax_payer_type || "Consumidor Final",
                    address: fullBillingAddress,
                    buyer_name: `${order.buyer.first_name} ${order.buyer.last_name}`,
                    identification: {
                        type: order.buyer.identification?.type || "ID",
                        number:
                            order.buyer.identification?.number ||
                            "No available",
                    },
                },
                order_items: order.order_items.map((item) => ({
                    sku: item.item.seller_sku,
                    title: item.item.title,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    currency: item.currency_id,
                })),
                payments: order.payments.map((payment) => ({
                    id: payment.id,
                    payment_method: payment.payment_method_id,
                    status: payment.status,
                    status_detail: payment.status_detail,
                    total_paid: payment.total_paid_amount,
                    installments: payment.installments,
                    installment_amount: payment.transaction_amount,
                    date_approved: payment.date_approved,
                })),
                shipping_id: order.shipping.id, // Also include at root level for easier access
            };
        } catch (error) {
            console.error(
                "❌ Failed to get single order:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    // fetch single user's buyer info
    async getBuyerInfo(buyerId) {
        try {
            // Fetch buyer info from API
            const buyer = await this.meliAPI.getBuyerInfo(buyerId);

            // Transform data if needed
            return {
                id: buyer.id,
                nickname: buyer.nickname,
                email: buyer.email || null,
                first_name: buyer.first_name || null,
                last_name: buyer.last_name || null,
                phone: buyer.phone?.number || null,
                address: buyer.address?.address || null,
                city: buyer.address?.city || null,
                state: buyer.address?.state || null,
                zip_code: buyer.address?.zip_code || null,
                registration_date: buyer.registration_date || null,
                user_type: buyer.user_type || null,
                points: buyer.points || null,
                site_id: buyer.site_id || null,
                permalink: buyer.permalink || null,
                status: buyer.status || null,
                identification: buyer.identification || null, // Add identification info
            };
        } catch (err) {
            console.error("Error fetching buyer info:", err);
            throw err;
        }
    }

    async getBillingInfo(orderId) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/orders/${orderId}/billing_info`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );

            return response.data;
        } catch (err) {
            console.error("Error fetching billing info:", err);
            // Return empty object instead of throwing error to continue processing
            return {};
        }
    }

    //For testing purposes
    async createFullTestUser() {
        try {
            // If you don't have an access token, request one within the method:
            if (!this.accessToken) {
                const payload = new URLSearchParams({
                    grant_type: "client_credentials",
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                });

                const res = await axios.post(
                    `${this.baseUrl}/oauth/token`,
                    payload.toString(),
                    {
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                    }
                );

                this.accessToken = res.data.access_token;
                console.log(
                    "✅ App access token obtained inside createFullTestUser"
                );
            }

            // Now make the call to create a test user
            const userResponse = await axios.post(
                `${this.baseUrl}/users/test_user`,
                { site_id: "MLM" }, // Use MLM for Mexico
                {
                    headers: { "Content-Type": "application/json" },
                    params: {
                        access_token: this.accessToken,
                    },
                }
            );

            const testUser = userResponse.data;
            console.log("✅ Test user created:", testUser.nickname);

            // Simulate additional profile data for a Mexican user
            const simulatedProfile = {
                ...testUser,
                simulated: {
                    email: testUser.email,
                    phone: {
                        number: "5555555555",
                        area_code: "55",
                        extension: null,
                        verified: true,
                    },
                    address: {
                        street_name: "Avenida Reforma",
                        street_number: "123",
                        city: "Ciudad de México",
                        zip_code: "11100",
                        state: "Ciudad de México",
                        country: "México",
                    },
                },
            };

            return simulatedProfile;
        } catch (err) {
            console.error(
                "❌ Error in createFullTestUser:",
                err.response?.data || err.message
            );
            throw err;
        }
    }

    async getOrderDetails(orderId, fields) {
        try {
            if (!this.token) {
                throw new Error("No access token available");
            }

            // Build query string if specific fields are requested
            const query = fields ? `?attributes=${fields.join(",")}` : "";

            const response = await axios.get(
                `${this.baseUrl}/orders/${orderId}${query}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );

            return response.data;
        } catch (error) {
            console.error(
                "❌ Failed to get order details:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    async getAllShipments(params = {}) {
        try {
            if (!this.token) {
                throw new Error("No access token available");
            }

            // Get user ID first
            const userInfo = await axios.get(`${this.baseUrl}/users/me`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });
            const userId = userInfo.data.id;

            // Default params
            const defaultParams = {
                seller: userId,
                sort: "date_desc",
                limit: 50,
                offset: 0,
            };

            const finalParams = { ...defaultParams, ...params };
            const queryString = qs.stringify(finalParams);

            const response = await axios.get(
                `${this.baseUrl}/shipments/search?${queryString}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );

            return response.data;
        } catch (error) {
            console.error(
                "❌ Failed to get shipments:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    async getShipment(shipmentId) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/shipments/${shipmentId}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );

            return response.data;
        } catch (err) {
            console.error("Error fetching shipment:", err);
            throw err;
        }
    }

async getAvailableInventory() {
    if (!this.token) {
        throw new Error("Access token is missing");
    }

    try {
        // Paso 0: obtener el user_id con el token
        const userRes = await axios.get(`${this.baseUrl}/users/me`, {
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
        });

        const userId = userRes.data.id;

        // Paso 1: obtener los items del vendedor
        const itemsRes = await axios.get(
            `${this.baseUrl}/users/${userId}/items/search`,
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            }
        );

        const itemIds = itemsRes.data.results;
        if (itemIds.length === 0) return [];

        // Paso 2: obtener los detalles de cada item
        const inventory = await Promise.all(
            itemIds.map(async (itemId) => {
                try {
                    const itemRes = await axios.get(
                        `${this.baseUrl}/items/${itemId}`,
                        {
                            headers: {
                                Authorization: `Bearer ${this.token}`,
                            },
                        }
                    );

                    const item = itemRes.data;

                    const skuAttr = item.attributes.find(
                        (attr) => attr.id === "SELLER_SKU"
                    );
                    const sku = skuAttr?.value_name || null;

                    // 🚚 Si es fulfillment, usar el stock del inventario
                    if (item.user_product_id) {
                        try {
                            const invRes = await axios.get(
                                `${this.baseUrl}/inventory_items/${item.user_product_id}`,
                                {
                                    headers: {
                                        Authorization: `Bearer ${this.token}`,
                                    },
                                }
                            );

                            const warehouse = invRes.data?.warehouses?.[0];

                            return {
                                id: item.id,
                                title: item.title,
                                sku,
                                fulfillment: true,
                                available_quantity: warehouse?.available_quantity ?? 0,
                                reserved_quantity: warehouse?.reserved_quantity ?? 0,
                                warehouse_id: warehouse?.id ?? null,
                                status: item.status,
                            };
                        } catch (fulfillErr) {
                            console.warn(`⚠️ Error en inventario fulfillment para ${item.id}:`, fulfillErr.message);
                            // fallback a datos del item si hay error
                        }
                    }

                    // 🛒 Normal
                    return {
                        id: item.id,
                        title: item.title,
                        sku,
                        fulfillment: false,
                        available_quantity: item.available_quantity,
                        sold_quantity: item.sold_quantity,
                        status: item.status,
                    };
                } catch (err) {
                    console.warn(`⚠️ Error fetching item ${itemId}:`, err.message);
                    return null;
                }
            })
        );

        return inventory.filter(Boolean);
    } catch (err) {
        console.error("❌ Error in getAvailableInventory:", err.message);
        throw err;
    }
}


    /*     async getAvailableInventory() {
        if (!this.token) {
            throw new Error("Access token is missing");
        }

        // Paso 1: obtener los items del vendedor
        const itemsRes = await axios.get(
            `${this.baseUrl}/users/${this.userId}/items/search`,
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            }
        );

        const itemIds = itemsRes.data.results;

        if (itemIds.length === 0) return [];

        // Paso 2: obtener user_product_id y consultar stock
        const inventory = await Promise.all(
            itemIds.map(async (itemId) => {
                try {
                    const itemRes = await axios.get(
                        `${this.baseUrl}/items/${itemId}`,
                        {
                            headers: {
                                Authorization: `Bearer ${this.token}`,
                            },
                        }
                    );

                    const { title, id, user_product_id } = itemRes.data;

                    // Si no tiene fulfillment, lo saltamos
                    if (!user_product_id) return null;

                    const invRes = await axios.get(
                        `${this.baseUrl}/inventory_items/${user_product_id}`,
                        {
                            headers: {
                                Authorization: `Bearer ${this.token}`,
                            },
                        }
                    );

                    const warehouse = invRes.data.warehouses?.[0];

                    return {
                        id,
                        title,
                        user_product_id,
                        available_quantity: warehouse?.available_quantity || 0,
                        reserved_quantity: warehouse?.reserved_quantity || 0,
                        warehouse_id: warehouse?.id || null,
                    };
                } catch (err) {
                    console.warn(
                        `⚠️ Error fetching inventory for item ${itemId}:`,
                        err.message
                    );
                    return null;
                }
            })
        );

        // Filtrar nulos
        return inventory.filter(Boolean);
    } */
}

module.exports = MeliAPI;
