//src/models/MeliOrder.js
const mongoose = require("mongoose");

const MeliOrderSchema = new mongoose.Schema(
    {
        orderId: { type: Number, unique: true },
        status: String,
        date_created: Date,
        total_amount: Number,
        currency: String,

        buyer: {
            id: Number,
            nickname: String,
        },

        shipping_id: Number,

        order_items: [
            {
                item: {
                    id: String,
                    title: String,
                    category_id: String,
                    seller_sku: String,
                    condition: String,
                    warranty: String,
                },
                quantity: Number,
                unit_price: Number,
                full_unit_price: Number,
                currency_id: String,
                sale_fee: Number,
                listing_type_id: String,
                requested_quantity: {
                    measure: String,
                    value: Number,
                },
            },
        ],

        payments: [
            {
                id: Number,
                order_id: Number,
                payer_id: Number,
                installments: Number,
                processing_mode: String,
                payment_method_id: String,
                payment_type: String,
                status: String,
                status_detail: String,
                transaction_amount: Number,
                total_paid_amount: Number,
                net_received_amount: Number,
                date_approved: Date,
                date_created: Date,
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model("MeliOrder", MeliOrderSchema);
