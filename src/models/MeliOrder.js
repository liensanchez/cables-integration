const mongoose = require("mongoose");

const MeliOrderSchema = new mongoose.Schema(
    {
        orderId: { type: Number, unique: true },
        status: String,
        date_created: Date,
        total_amount: Number,
        buyer_nickname: String,
        shipping_id: Number,
    },
    { timestamps: true }
);

module.exports = mongoose.model("MeliOrder", MeliOrderSchema);
