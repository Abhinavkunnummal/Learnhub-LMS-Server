const express = require("express");
const Enrollment = require("../models/Enrollment");
const Course = require("../models/Course");
const Certificate = require("../models/Certificate");
const { auth, authorize } = require("../middleware/auth");
const crypto = require("crypto");

const router = express.Router();

// POST /api/enrollments - Enroll in a course
router.post("/", auth, async (req, res) => {
  try {
    const { courseId } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check if already enrolled
    const existing = await Enrollment.findOne({
      student: req.user._id,
      course: courseId,
    });
    if (existing) {
      return res.status(400).json({ message: "Already enrolled" });
    }

    const enrollment = await Enrollment.create({
      student: req.user._id,
      course: courseId,
    });

    // Add student to course
    course.enrolledStudents.push(req.user._id);
    await course.save();

    // If paid course, credit 80% to instructor and 20% to admin
    if (course.price > 0) {
      const User = require("../models/User");
      const Transaction = require("../models/Transaction");

      const totalAmount = course.price;
      const instructorAmount = Math.round(totalAmount * 0.8 * 100) / 100;
      const adminAmount = Math.round(totalAmount * 0.2 * 100) / 100;

      const instructorId = course.instructor?._id || course.instructor;
      if (instructorId) {
        await User.findByIdAndUpdate(instructorId, {
          $inc: { wallet: instructorAmount },
        });

        await Transaction.create({
          user: instructorId,
          type: "credit",
          amount: instructorAmount,
          source: "course_sale",
          course: course._id,
          fromUser: req.user._id,
          paymentId: `pay_enroll_${Date.now()}`,
          orderId: `order_enroll_${Date.now()}`,
          status: "completed",
          description: `Course Sale (80% share): ${course.title}`,
        });
      }

      const adminUser = await User.findOne({ role: "admin" });
      if (adminUser) {
        await User.findByIdAndUpdate(adminUser._id, {
          $inc: { wallet: adminAmount },
        });

        await Transaction.create({
          user: adminUser._id,
          type: "credit",
          amount: adminAmount,
          source: "platform_commission",
          course: course._id,
          fromUser: req.user._id,
          paymentId: `pay_enroll_${Date.now()}`,
          orderId: `order_enroll_${Date.now()}`,
          status: "completed",
          description: `Platform Commission (20%): ${course.title}`,
        });
      }

      await Transaction.create({
        user: req.user._id,
        type: "debit",
        amount: totalAmount,
        source: "course_purchase",
        course: course._id,
        paymentId: `pay_enroll_${Date.now()}`,
        orderId: `order_enroll_${Date.now()}`,
        status: "completed",
        description: `Purchased & Enrolled in: ${course.title}`,
      });
    }

    res.status(201).json({ success: true, enrollment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/enrollments/my-courses - Get enrolled courses
router.get("/my-courses", auth, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ student: req.user._id })
      .populate({
        path: "course",
        populate: { path: "instructor", select: "name avatar" },
      })
      .sort("-lastAccessedAt");

    res.json({ success: true, enrollments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/enrollments/check/:courseId - Check enrollment status
router.get("/check/:courseId", auth, async (req, res) => {
  try {
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: req.params.courseId,
    });

    res.json({
      success: true,
      enrolled: !!enrollment,
      enrollment,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/enrollments/complete-lesson - Mark lesson as completed
router.put("/complete-lesson", auth, async (req, res) => {
  try {
    const { courseId, lessonId } = req.body;

    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: courseId,
    });

    if (!enrollment) {
      return res.status(404).json({ message: "Not enrolled in this course" });
    }

    // Add lesson to completed (if not already)
    if (!enrollment.completedLessons.includes(lessonId)) {
      enrollment.completedLessons.push(lessonId);
    }

    // Calculate progress
    const course = await Course.findById(courseId).populate("lessons");
    const totalLessons = course.lessons.length;
    const completedCount = enrollment.completedLessons.length;
    enrollment.progress = Math.round((completedCount / totalLessons) * 100);

    // Check if course is completed
    if (enrollment.progress === 100 && !enrollment.isCompleted) {
      enrollment.isCompleted = true;
      enrollment.completedAt = new Date();

      // Generate certificate
      const certId = `CERT-${Date.now()}-${crypto
        .randomBytes(4)
        .toString("hex")}`;
      await Certificate.create({
        student: req.user._id,
        course: courseId,
        certificateId: certId,
        completionDate: new Date(),
      });
    }

    enrollment.lastAccessedAt = new Date();
    await enrollment.save();

    res.json({ success: true, enrollment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/enrollments/course/:courseId/students - Get enrolled students (instructor)
router.get(
  "/course/:courseId/students",
  auth,
  authorize("instructor", "admin"),
  async (req, res) => {
    try {
      const enrollments = await Enrollment.find({
        course: req.params.courseId,
      }).populate("student", "name email avatar");

      res.json({ success: true, enrollments });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /api/enrollments/:courseId - Unenroll
router.delete("/:courseId", auth, async (req, res) => {
  try {
    const enrollment = await Enrollment.findOneAndDelete({
      student: req.user._id,
      course: req.params.courseId,
    });

    if (!enrollment) {
      return res.status(404).json({ message: "Not enrolled" });
    }

    // Remove from course
    await Course.findByIdAndUpdate(req.params.courseId, {
      $pull: { enrolledStudents: req.user._id },
    });

    res.json({ success: true, message: "Unenrolled" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
