const express = require("express");
const User = require("../models/User");
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const Certificate = require("../models/Certificate");
const { auth, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/admin/dashboard - Admin dashboard stats
router.get("/dashboard", auth, authorize("admin"), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCourses = await Course.countDocuments();
    const totalEnrollments = await Enrollment.countDocuments();
    const totalCertificates = await Certificate.countDocuments();

    const pendingInstructors = await User.countDocuments({
      role: "instructor",
      isApproved: false,
    });

    const usersByRole = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);

    const recentEnrollments = await Enrollment.find()
      .populate("student", "name email")
      .populate("course", "title")
      .sort("-createdAt")
      .limit(10);

    const popularCourses = await Course.find()
      .sort("-enrolledStudents")
      .limit(5)
      .populate("instructor", "name");

    const monthlyEnrollments = await Enrollment.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalCourses,
        totalEnrollments,
        totalCertificates,
        pendingInstructors,
        usersByRole,
        recentEnrollments,
        popularCourses,
        monthlyEnrollments,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/admin/instructors - Get pending instructors
router.get("/instructors", auth, authorize("admin"), async (req, res) => {
  try {
    const instructors = await User.find({ role: "instructor" })
      .select("-password")
      .sort("-createdAt");

    res.json({ success: true, instructors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/admin/instructors/:id/approve
router.put(
  "/instructors/:id/approve",
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

// DELETE /api/admin/courses/:id - Delete any course (admin)
router.delete(
  "/courses/:id",
  auth,
  authorize("admin"),
  async (req, res) => {
    try {
      const course = await Course.findByIdAndDelete(req.params.id);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      res.json({ success: true, message: "Course deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
