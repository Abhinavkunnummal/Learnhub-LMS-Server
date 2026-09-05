const express = require("express");
const { body, validationResult } = require("express-validator");
const Lesson = require("../models/Lesson");
const Course = require("../models/Course");
const { auth, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/lessons/course/:courseId - Get lessons for a course
router.get("/course/:courseId", async (req, res) => {
  try {
    const lessons = await Lesson.find({ course: req.params.courseId }).sort(
      "order"
    );
    res.json({ success: true, lessons });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/lessons/:id - Get single lesson
router.get("/:id", async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id).populate(
      "course",
      "title"
    );
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }
    res.json({ success: true, lesson });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/lessons - Create lesson
router.post(
  "/",
  auth,
  authorize("instructor", "admin"),
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("course").notEmpty().withMessage("Course ID is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Verify course ownership
      const course = await Course.findById(req.body.course);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      if (
        course.instructor.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Get next order number
      const lastLesson = await Lesson.findOne({
        course: req.body.course,
      }).sort("-order");
      const order = lastLesson ? lastLesson.order + 1 : 1;

      const lesson = await Lesson.create({ ...req.body, order });

      // Add lesson to course
      course.lessons.push(lesson._id);
      await course.save();

      res.status(201).json({ success: true, lesson });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /api/lessons/:id - Update lesson
router.put(
  "/:id",
  auth,
  authorize("instructor", "admin"),
  async (req, res) => {
    try {
      let lesson = await Lesson.findById(req.params.id);
      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }

      const course = await Course.findById(lesson.course);
      if (
        course.instructor.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      lesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });

      res.json({ success: true, lesson });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// DELETE /api/lessons/:id
router.delete(
  "/:id",
  auth,
  authorize("instructor", "admin"),
  async (req, res) => {
    try {
      const lesson = await Lesson.findById(req.params.id);
      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }

      const course = await Course.findById(lesson.course);
      if (
        course.instructor.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Remove from course
      course.lessons = course.lessons.filter(
        (id) => id.toString() !== req.params.id
      );
      await course.save();

      await lesson.deleteOne();

      res.json({ success: true, message: "Lesson deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /api/lessons/reorder - Reorder lessons
router.put(
  "/reorder",
  auth,
  authorize("instructor", "admin"),
  async (req, res) => {
    try {
      const { lessonIds } = req.body; // Array of lesson IDs in new order

      for (let i = 0; i < lessonIds.length; i++) {
        await Lesson.findByIdAndUpdate(lessonIds[i], { order: i + 1 });
      }

      res.json({ success: true, message: "Lessons reordered" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
