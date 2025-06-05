// src/services/mercadolibre/meliService.js
const MeliAPI = require("./meliAPI");
const odooService = require("../../services/odooService");
/* const ErrorQueue = require('../../models/ErrorQueue'); // Assuming Mongoose */
const MeliOrder = require("../../models/MeliOrder");

class MercadoLibreService {
    constructor() {
        this.meliAPI = new MeliAPI(); // instance to handle raw API calls
        this.odooService = new odooService(); // instance to handle Odoo API calls
    }

    // Pass the received authorization code to the API method
    async getAccessTokenWithUser(code) {
        try {
            const tokenResponse =
                await this.meliAPI.getAccessTokenWithCode(code); // fetch access token with the code
            return tokenResponse;
        } catch (err) {
            console.error("Error getting access token:", err);
            throw err;
        }
    }

    // Method to get one order for the user
    async getSingleOrder(orderId) {
        try {
            // 1. Fetch the order from MercadoLibre API
            const order = await this.meliAPI.getSingleOrder(orderId);

            // 2. Fetch additional buyer info if available
            let fullBuyerInfo = {};
            if (order.buyer?.id) {
                try {
                    fullBuyerInfo = await this.getBuyerInfo(order.buyer.id);
                } catch (buyerError) {
                    console.error(
                        `Could not fetch additional info for buyer ${order.buyer.id}:`,
                        buyerError.message
                    );
                    // Fall back to basic buyer info
                    fullBuyerInfo = {
                        id: order.buyer.id,
                        nickname: order.buyer.nickname,
                    };
                }
            }

            // 3. Prepare complete order object with merged buyer info
            const completeOrder = {
                ...order,
                buyer: {
                    ...order.buyer,
                    ...fullBuyerInfo,
                },
                // Ensure shipping_info.tags exists even if empty
                shipping_info: {
                    ...order.shipping_info,
                    tags: order.shipping_info?.tags || [], // This is the key change
                },
            };

            // 4. Check if order exists in database
            const existing = await MeliOrder.findOne({
                orderId: completeOrder.id,
            });

            if (existing) {
                console.log(
                    `🔄 Order ${completeOrder.id} already exists in database`
                );
                return completeOrder;
            }

            // 5. Create new order in database
            const newOrder = await MeliOrder.create({
                orderId: completeOrder.id,
                status: completeOrder.status,
                date_created: completeOrder.date_created,
                total_amount: completeOrder.total_amount,
                currency: completeOrder.currency,
                buyer: {
                    id: completeOrder.buyer.id,
                    nickname: completeOrder.buyer.nickname,
                    first_name: completeOrder.buyer.first_name,
                    last_name: completeOrder.buyer.last_name,
                    email: completeOrder.buyer.email,
                    phone: completeOrder.buyer.phone,
                    identification_type:
                        completeOrder.buyer.identification?.type,
                    identification_number:
                        completeOrder.buyer.identification?.number,
                },
                shipping: {
                    receiver_name: completeOrder.shipping_info.receiver_name,
                    receiver_phone: completeOrder.shipping_info.receiver_phone,
                    address: completeOrder.shipping_info.address,
                    status: completeOrder.shipping_info.shipping_status,
                    tags: completeOrder.shipping_info.tags, // Now properly included
                },
                order_items: completeOrder.order_items,
                payments: completeOrder.payments.map((payment) => ({
                    id: payment.id,
                    status: payment.status,
                    total_paid: payment.total_paid,
                    date_approved: payment.date_approved,
                })),
            });

            console.log(
                `📝 Created new order in database: ${newOrder.orderId}`
            );

            // Check if order should be marked as completed based on tags
            await this.checkAndUpdateOrderStatus(newOrder);

            // 6. Send to Odoo with complete information
            const odooResults = await this.odooService.pushOrdersToOdoo([
                completeOrder,
            ]);
            const odooResult = odooResults[0];

            // 7. Update MongoDB with Odoo references
            if (odooResult.odooId) {
                await MeliOrder.findOneAndUpdate(
                    { orderId: completeOrder.id },
                    {
                        odoo_id: odooResult.odooId,
                        odoo_reference: odooResult.odooReference,
                        odoo_client_ref: odooResult.odooClientRef,
                        odoo_picking_ids: odooResult.odooPickings.map((p) => ({
                            id: p.id,
                            name: p.name,
                            status: p.state,
                        })),
                    }
                );
            }

            return {
                ...completeOrder,
                odooReference: odooResult.odooReference,
                odooId: odooResult.odooId,
                odooPickings: odooResult.odooPickings,
            };
        } catch (err) {
            console.error("Error fetching single order:", err);
            throw err;
        }
    }

    // Method to get products for the user
    async getUserProducts() {
        try {
            const products = await this.meliAPI.getUserProducts(); // fetch products using the access token
            return products;
        } catch (err) {
            console.error("Error fetching products:", err);
            throw err;
        }
    }

    // Method to get orders for the user
    async getUserOrders() {
        try {
            const orders = await this.meliAPI.getUserOrders();

            const processedOrders = await Promise.all(
                orders.map(async (order) => {
                    const existing = await MeliOrder.findOne({
                        orderId: order.id,
                    });

                    if (existing) {
                        await MeliOrder.findOneAndUpdate(
                            { orderId: order.id },
                            {
                                status: order.status,
                                date_created: order.date_created,
                                total_amount: order.total_amount,
                                buyer: order.buyer,
                                currency: order.currency,
                                order_items: order.order_items,
                                payments: order.payments,
                            },
                            { new: true }
                        );
                    } else {
                        await MeliOrder.create({
                            orderId: order.id,
                            status: order.status,
                            date_created: order.date_created,
                            total_amount: order.total_amount,
                            buyer_nickname: order.buyer.nickname,
                            currency: order.currency,
                            order_items: order.order_items,
                            payments: order.payments,
                        });
                    }

                    // Enviar a Odoo
                    await this.odooService.pushOrdersToOdoo([order]);

                    return order;
                })
            );

            return processedOrders;
        } catch (err) {
            console.error("Error fetching and saving orders:", err);
            throw err;
        }
    }

    // Method to get info from a buyer
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
            };
        } catch (err) {
            console.error("Error fetching buyer info:", err);
            throw err;
        }
    }

    async createTestUser() {
        try {
            const testUser = await this.meliAPI.createFullTestUser();
            return testUser;
        } catch (error) {
            console.error("❌ Error in createTestUser:", error.message);
            throw error;
        }
    }

    async getOrderDetails(orderId, fields) {
        try {
            const details = await this.meliAPI.getOrderDetails(orderId, fields);
            return details;
        } catch (err) {
            console.error("Error getting order details:", err);
            throw err;
        }
    }

    async getAllShipments(params = {}) {
        try {
            const shipments = await this.meliAPI.getAllShipments(params);

            // Optionally process or transform the data here
            return shipments;
        } catch (err) {
            console.error("Error getting shipments:", err);
            throw err;
        }
    }

    async checkAndUpdateOrderStatus(order) {
        try {
            // 1. Get the latest order data from MercadoLibre
            const freshOrder = await this.meliAPI.getSingleOrder(order.orderId);

            // 2. Check specifically for delivered status
            const isDelivered =
                freshOrder.shipping_info?.shipping_status === "delivered" ||
                freshOrder.shipping_info?.tags?.includes("delivered");

            if (isDelivered) {
                console.log(
                    `🔄 Order ${order.orderId} is marked as delivered, updating status...`
                );

                // 3. Update order in MongoDB
                await MeliOrder.findOneAndUpdate(
                    { orderId: order.orderId },
                    {
                        status: "completed",
                        "shipping.status": "delivered",
                        "shipping.tags": freshOrder.shipping_info?.tags || [],
                    }
                );

                // 4. Get the stored Odoo reference
                const dbOrder = await MeliOrder.findOne({
                    orderId: order.orderId,
                });

                if (!dbOrder.odoo_id) {
                    console.warn(
                        `⚠️ No Odoo reference found for MercadoLibre order ${order.orderId}`
                    );
                    return;
                }

                // 5. Update status in Odoo using the stored ID
                await this.odooService.updateOrderStatus(
                    dbOrder.odoo_id,
                    "delivered"
                );
                console.log(
                    `✅ Updated Odoo order ${dbOrder.odoo_reference} (ID: ${dbOrder.odoo_id}) to delivered`
                );
            } else {
                console.log(
                    `⏩ Order ${order.orderId} not delivered yet (status: ${freshOrder.shipping_info?.shipping_status})`
                );
            }
        } catch (err) {
            console.error(
                `❌ Error updating order status for ${order.orderId}:`,
                err
            );
        }
    }
}

module.exports = MercadoLibreService;
