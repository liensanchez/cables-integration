// src/models/MeliOrder.js
const mongoose = require("mongoose");

const MeliOrderSchema = new mongoose.Schema(
    {
        orderId: { type: Number, unique: true },
        status: String,
        date_created: Date,
        total_amount: Number,
        currency: String,
        odoo_reference: String, // Add this field to store Odoo order reference
        odoo_id: Number, // Add this to store Odoo's internal ID
        buyer: {
            id: Number,
            nickname: String,
            first_name: String,
            last_name: String,
            email: String,
            phone: String,
            identification_type: String,
            identification_number: String,
        },
        shipping: {
            receiver_name: String,
            receiver_phone: String,
            address: String,
            status: String,
            tags: [String], // Add this field for shipment tags
        },
        order_items: [
            {
                sku: String,
                title: String,
                quantity: Number,
                unit_price: Number,
                currency: String,
            },
        ],
        payments: [
            {
                id: Number,
                status: String,
                total_paid: Number,
                date_approved: Date,
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model("MeliOrder", MeliOrderSchema);
