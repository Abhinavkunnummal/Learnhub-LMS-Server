const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Course = require("../models/Course");
const Transaction = require("../models/Transaction");
const { auth } = require("../middleware/auth");

const router = express.Router();

// GET /api/wallet/my-wallet - Get current user's wallet and transactions
router.get("/my-wallet", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const transactions = await Transaction.find({ user: req.user._id })
      .populate("course", "title thumbnail price")
      .populate("fromUser", "name email")
      .sort("-createdAt")
      .limit(100);

    // Compute stats from all user transactions
    const allUserTransactions = await Transaction.find({ user: req.user._id });
    let totalEarned = 0;
    let totalSpent = 0;

    allUserTransactions.forEach((tx) => {
      if (tx.type === "credit") {
        totalEarned += Number(tx.amount) || 0;
      } else if (tx.type === "debit") {
        totalSpent += Number(tx.amount) || 0;
      }
    });

    totalEarned = Math.round(totalEarned * 100) / 100;
    totalSpent = Math.round(totalSpent * 100) / 100;

    res.json({
      success: true,
      balance: user.wallet || 0,
      stats: {
        totalEarned,
        totalSpent,
        totalTransactions: allUserTransactions.length,
      },
      transactions,
    });
  } catch (error) {
    console.error("Wallet error:", error);
    res.status(500).json({ message: error.message || "Failed to fetch wallet" });
  }
});

// POST /api/wallet/withdraw - Request payout / withdrawal
router.post("/withdraw", auth, async (req, res) => {
  try {
    const { amount, paymentDetails } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(400).json({ message: "Invalid withdrawal amount" });
    }

    const user = await User.findById(req.user._id);
    if ((user.wallet || 0) < withdrawAmount) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    // Deduct from wallet
    user.wallet -= withdrawAmount;
    await user.save();

    // Create withdrawal transaction
    const transaction = await Transaction.create({
      user: user._id,
      type: "debit",
      amount: withdrawAmount,
      source: "withdrawal",
      status: "completed",
      description: `Withdrawal request processed: ${paymentDetails || "Direct payout"}`,
    });

    res.json({
      success: true,
      message: `Successfully withdrawn $${withdrawAmount}!`,
      newBalance: user.wallet,
      transaction,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Withdrawal failed" });
  }
});

module.exports = router;
