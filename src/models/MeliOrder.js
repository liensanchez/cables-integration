// src/models/MeliOrder.js
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
            first_name: String,
            last_name: String,
            email: String,
            phone: String, // Simplified phone storage
            identification_type: String, // Store type separately
            identification_number: String // Store number separately
        },
        shipping: {
            receiver_name: String,
            receiver_phone: String,
            address: String
        },
        order_items: [
            {
                sku: String,
                title: String,
                quantity: Number,
                unit_price: Number,
                currency: String,
            }
        ],
        payments: [
            {
                id: Number,
                status: String,
                total_paid: Number,
                date_approved: Date
            }
        ]
    },
    { timestamps: true }
);

module.exports = mongoose.model("MeliOrder", MeliOrderSchema);