const express = require("express");
const { body, validationResult } = require("express-validator");
const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const Enrollment = require("../models/Enrollment");
const { auth, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/courses - Get all published courses
router.get("/", async (req, res) => {
  try {
    const { category, level, search, sort, page = 1, limit = 12 } = req.query;

    const query = { isPublished: true };

    if (category) query.category = category;
    if (level) query.level = level;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    let sortOption = "-createdAt";
    if (sort === "popular") sortOption = "-enrolledStudents";
    if (sort === "rating") sortOption = "-rating.average";
    if (sort === "price") sortOption = "price";

    const total = await Course.countDocuments(query);
    const courses = await Course.find(query)
      .populate("instructor", "name avatar")
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/courses/my-courses - Instructor's courses
router.get("/my-courses", auth, authorize("instructor"), async (req, res) => {
  try {
    const courses = await Course.find({ instructor: req.user._id })
      .populate("lessons")
      .sort("-createdAt");
    res.json({ success: true, courses });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/courses/:id - Get single course
router.get("/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate("instructor", "name avatar bio")
      .populate("lessons");

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.json({ success: true, course });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/courses - Create course (instructor/admin)
router.post(
  "/",
  auth,
  authorize("instructor", "admin"),
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("category").notEmpty().withMessage("Category is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const course = await Course.create({
        ...req.body,
        instructor: req.user._id,
      });

      res.status(201).json({ success: true, course });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /api/courses/:id - Update course
router.put("/:id", auth, authorize("instructor", "admin"), async (req, res) => {
  try {
    let course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check ownership
    if (
      course.instructor.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    course = await Course.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, course });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/courses/:id
router.delete(
  "/:id",
  auth,
  authorize("instructor", "admin"),
  async (req, res) => {
    try {
      const course = await Course.findById(req.params.id);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      if (
        course.instructor.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Delete related lessons
      await Lesson.deleteMany({ course: req.params.id });
      await Enrollment.deleteMany({ course: req.params.id });
      await course.deleteOne();

      res.json({ success: true, message: "Course deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// POST /api/courses/:id/rate - Rate a course
router.post("/:id/rate", auth, async (req, res) => {
  try {
    const { rating } = req.body;
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be 1-5" });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Calculate new average
    const newCount = course.rating.count + 1;
    const newAverage =
      (course.rating.average * course.rating.count + rating) / newCount;

    course.rating = {
      average: Math.round(newAverage * 10) / 10,
      count: newCount,
    };

    await course.save();
    res.json({ success: true, course });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
