const express = require("express");
const User = require("../models/User");
const { auth, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/users - Get all users (admin only)
router.get("/", auth, authorize("admin"), async (req, res) => {
  try {
    const { role, search } = req.query;
    const query = {};

    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query).select("-password").sort("-createdAt");
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/users/instructors - Get approved instructors
router.get("/instructors", async (req, res) => {
  try {
    const instructors = await User.find({
      role: "instructor",
      isApproved: true,
    }).select("-password");
    res.json({ success: true, instructors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/users/:id - Get user profile
router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/users/:id/approve - Approve instructor (admin only)
router.put(
  "/:id/approve",
  auth,
  authorize("admin"),
  async (req, res) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isApproved: true },
        { new: true }
      ).select("-password");

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ success: true, user });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /api/users/:id - Delete user (admin only)
router.delete("/:id", auth, authorize("admin"), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
