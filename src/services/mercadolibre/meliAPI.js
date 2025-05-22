// src/services/mercadolibre/meliAPI.js
const axios = require("axios");
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

    // fetch single user's orders
    async getSingleOrder(orderId) {
        try {
            if (!this.token) {
                throw new Error("No access token available");
            }

            // First get the basic order information
            const orderResponse = await axios.get(
                `${this.baseUrl}/orders/${orderId}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );
            const order = orderResponse.data;

            // Then get the shipping information (this often comes from a separate endpoint)
            const shippingResponse = await axios.get(
                `${this.baseUrl}/shipments/${order.shipping.id}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );
            const shipping = shippingResponse.data;

            // Extract receiver address (this is where most shipping info is)
            const receiverAddress = shipping.receiver_address;

            // Format the full shipping address
            const fullShippingAddress = [
                receiverAddress.street_name,
                receiverAddress.street_number,
                receiverAddress.comment,
                `${receiverAddress.zip_code} - ${receiverAddress.city.name}, ${receiverAddress.state.name}`,
            ]
                .filter(Boolean)
                .join(" - ");

            // Format the full billing address (same as shipping unless specified otherwise)
            const fullBillingAddress = [
                receiverAddress.street_name,
                receiverAddress.street_number,
                `${receiverAddress.zip_code} - ${receiverAddress.city.name}, ${receiverAddress.state.name}`,
            ]
                .filter(Boolean)
                .join(" - ");

            // Transform the data
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
                        type: order.buyer.identification?.type || "DNI",
                        number:
                            order.buyer.identification?.number || "11111111",
                    },
                },
                shipping_info: {
                    receiver_name: shipping.receiver_address.receiver_name,
                    receiver_phone: shipping.receiver_address.receiver_phone,
                    address: fullShippingAddress,
                    shipping_type: shipping.shipping_type,
                    shipping_cost: shipping.cost,
                    shipping_mode: shipping.shipping_mode,
                    shipping_status: shipping.status,
                },
                billing_info: {
                    tax_payer_type:
                        order.buyer.tax_payer_type || "Consumidor Final",
                    address: fullBillingAddress,
                    buyer_name: `${order.buyer.first_name} ${order.buyer.last_name}`,
                    identification: {
                        type: order.buyer.identification?.type || "DNI",
                        number:
                            order.buyer.identification?.number || "11111111",
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
            if (!this.token) {
                throw new Error("No access token available");
            }

            const response = await axios.get(
                `${this.baseUrl}/users/${buyerId}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                    },
                }
            );

            return response.data;
        } catch (error) {
            console.error(
                "❌ Failed to get buyer info:",
                error.response?.data || error.message
            );
            throw error;
        }
    }

    //For testing purposes
    async createFullTestUser() {
        try {
            // Si no tenés accessToken, pedilo dentro del método:
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

            // Ahora sí hacés la llamada para crear usuario de prueba
            const userResponse = await axios.post(
                `${this.baseUrl}/users/test_user`,
                { site_id: "MLA" },
                {
                    headers: { "Content-Type": "application/json" },
                    params: {
                        access_token: this.accessToken,
                    },
                }
            );

            const testUser = userResponse.data;
            console.log("✅ Test user created:", testUser.nickname);

            // Simulación de datos adicionales
            const simulatedProfile = {
                ...testUser,
                simulated: {
                    email: testUser.email,
                    phone: {
                        number: "123456789",
                        area_code: "11",
                        extension: null,
                        verified: true,
                    },
                    address: {
                        street_name: "Av. Siempre Viva",
                        street_number: "742",
                        city: "Springfield",
                        zip_code: "1234",
                        state: "Buenos Aires",
                        country: "Argentina",
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
}

module.exports = MeliAPI;
